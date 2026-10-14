-- =============================================================================
-- Notifications V2: consolidated squad activity, shared milestones + rally,
-- private monthly check-in reminders, weekly recap, in-app cheers.
--
-- Additive only: no existing row (members, counts, history, devices) changes.
--
-- How it works
--   * The database decides WHAT to send, WHEN and TO WHOM (this file). The app
--     server only renders the wording and talks to the push services.
--   * A scheduler (Supabase Cron, every minute) calls the app's
--     /api/notify/run, which calls:
--       notify_plan(secret)      turn committed history into durable jobs
--       notify_claim(secret, n)  atomically claim due jobs + their recipients
--       notify_complete(...)     record each phone's result; retry or finish
--   * Every job has a unique dedupe key, so overlapping runs, retries and
--     concurrent saves can never create the same logical notification twice.
--   * Quiet hours (22:00-08:00 Asia/Singapore by default) are enforced here:
--     nothing is claimed for sending during quiet hours, and new jobs are
--     scheduled for the next allowed time. Milestones are only ordered first.
--   * Policy values live in ONE row: private.notify_policy.
--
-- Privacy: jobs store display names and squad totals only (never individual
-- case totals in squad-wide copy). Deliveries store the push host, never the
-- endpoint. Check-in status is private (read per member through a function).
-- Linking a phone to a member is a routing choice, not proof of identity.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Central policy (one row; edit with SQL to tune, defaults per product spec)
-- -----------------------------------------------------------------------------
create table private.notify_policy (
  id boolean primary key default true check (id),
  time_zone text not null default 'Asia/Singapore',
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  -- Routine activity is grouped from the first update for this long.
  activity_window interval not null default '60 seconds'
    check (activity_window between '5 seconds' and '1 hour'),
  -- One rally alert per month when the squad reaches this share of the target.
  rally_percent integer not null default 90 check (rally_percent between 51 and 99),
  -- Check-in reminders: first campaign month they apply to (no surprise
  -- reminders for a month that was already under way when this shipped).
  reminders_from date not null default '2026-11-01',
  reminder_first_after interval not null default '72 hours',
  reminder_every interval not null default '7 days',
  reminder_cap integer not null default 3 check (reminder_cap between 0 and 3),
  -- A phone must have been linked this long before it gets a reminder.
  reminder_link_grace interval not null default '12 hours',
  -- Weekly recap: ISO weekday (1 = Monday) and local time.
  recap_dow integer not null default 1 check (recap_dow between 1 and 7),
  recap_time time not null default '09:00',
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  claim_lease interval not null default '2 minutes',
  stale_activity interval not null default '6 hours',
  stale_other interval not null default '24 hours',
  cheer_gap interval not null default '2 seconds',
  cheer_client_per_minute integer not null default 8,
  cheer_squad_per_minute integer not null default 40,
  cheer_retention interval not null default '2 days',
  job_retention interval not null default '60 days'
);
insert into private.notify_policy default values;
alter table private.notify_policy enable row level security;
revoke all on table private.notify_policy from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Device link + preferences (on the existing anonymous subscriptions)
-- -----------------------------------------------------------------------------
alter table public.push_subscriptions
  add column squad_member_id uuid references public.squad_members (id) on delete set null,
  add column linked_at timestamptz,
  add column pref_activity boolean not null default true,
  add column pref_milestones boolean not null default true,
  add column pref_reminders boolean not null default true,
  add column pref_recap boolean not null default true;
create index push_subscriptions_member_idx on public.push_subscriptions (squad_member_id)
  where squad_member_id is not null;
comment on column public.push_subscriptions.squad_member_id is
  'Whose private check-in reminders this phone receives. Chosen on the phone; routing only, not identity.';

-- -----------------------------------------------------------------------------
-- 3. Monthly check-in (explicit; a count > 0 is never treated as a check-in)
-- -----------------------------------------------------------------------------
create table public.member_checkins (
  squad_member_id uuid not null references public.squad_members (id) on delete cascade,
  campaign_id uuid not null,
  month date not null,
  confirmed_count integer not null check (confirmed_count between 0 and 1000),
  confirmed_at timestamptz not null default now(),
  primary key (squad_member_id, campaign_id, month),
  constraint member_checkins_target_fk foreign key (campaign_id, month)
    references public.monthly_targets (campaign_id, month) on delete cascade
);
comment on table public.member_checkins is
  'A member confirmed their count for a campaign month (zero allowed). Private: read/written through functions only.';
alter table public.member_checkins enable row level security;
revoke all on table public.member_checkins from public, anon, authenticated;
grant select, insert, update, delete on table public.member_checkins to service_role;

-- -----------------------------------------------------------------------------
-- 4. Outbox
-- -----------------------------------------------------------------------------
create table private.notification_jobs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('activity', 'milestone', 'rally', 'reminder', 'recap')),
  dedupe_key text not null unique,
  priority smallint not null default 0 check (priority in (0, 1)), -- 1 = milestone
  campaign_id uuid,
  month date,
  squad_member_id uuid references public.squad_members (id) on delete set null, -- reminders only
  payload jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'done', 'failed', 'cancelled')),
  reason text check (char_length(reason) <= 60),       -- safe code, never a secret/endpoint
  scheduled_for timestamptz not null,
  attempts integer not null default 0,
  claim_token uuid,
  lease_until timestamptz,
  last_attempt_at timestamptz,
  finished_at timestamptz,
  accepted_count integer not null default 0,
  failed_count integer not null default 0,
  gone_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index notification_jobs_due_idx on private.notification_jobs (priority desc, scheduled_for, id)
  where status in ('pending', 'claimed');

-- One row per phone per job: retries never re-send to a phone that accepted.
-- "accepted" = the push service took the message (not proof it was seen).
create table private.notification_deliveries (
  id bigint generated always as identity primary key,
  job_id bigint not null references private.notification_jobs (id) on delete cascade,
  subscription_id uuid references public.push_subscriptions (id) on delete set null,
  push_service text,                          -- host only, e.g. web.push.apple.com
  status text not null check (status in ('accepted', 'gone', 'retry', 'rejected')),
  last_code integer,
  attempts integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (job_id, subscription_id)
);

-- Which committed history rows were already turned into activity (each row
-- belongs to exactly one batch). A row id set, not a cursor, so saves that
-- commit out of id order are never skipped.
create table private.notification_activity_items (
  history_id bigint primary key references public.case_update_history (id) on delete cascade,
  job_id bigint references private.notification_jobs (id) on delete set null,
  processed_at timestamptz not null default now()
);

-- Each milestone/rally is recorded exactly once per squad and month.
--   notified  announced by job_id
--   covered   crossed in a batch whose higher milestone was announced instead
--   silent    already reached before (backfill or a lowered target): not sent
--   stale     crossed in a month that had already closed: not sent
create table private.notification_milestones (
  squad_id uuid not null references public.squads (id) on delete cascade,
  campaign_id uuid not null,
  month date not null,
  key text not null check (key in ('started', 'halfway', 'momentum', 'rally', 'cleared')),
  threshold integer not null,
  status text not null check (status in ('notified', 'covered', 'silent', 'stale')),
  crossed_at timestamptz,
  history_id bigint,
  job_id bigint references private.notification_jobs (id) on delete set null,
  recorded_at timestamptz not null default now(),
  primary key (squad_id, campaign_id, month, key)
);

-- Reminder slots: the primary key + check make "at most 3 per member per month"
-- a database guarantee. A slot is used once, whatever its outcome.
create table private.checkin_reminders (
  squad_member_id uuid not null references public.squad_members (id) on delete cascade,
  campaign_id uuid not null,
  month date not null,
  seq integer not null check (seq between 1 and 3),
  due_at timestamptz not null,
  job_id bigint references private.notification_jobs (id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (squad_member_id, campaign_id, month, seq)
);

alter table private.notification_jobs enable row level security;
alter table private.notification_deliveries enable row level security;
alter table private.notification_activity_items enable row level security;
alter table private.notification_milestones enable row level security;
alter table private.checkin_reminders enable row level security;
revoke all on table private.notification_jobs, private.notification_deliveries,
  private.notification_activity_items, private.notification_milestones,
  private.checkin_reminders from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Cheers (anonymous, collective, never pushed, short retention)
-- -----------------------------------------------------------------------------
create table public.squad_cheers (
  id bigint generated always as identity primary key,
  squad_id uuid not null references public.squads (id) on delete cascade,
  cheer text not null check (cheer in ('lets_go', 'momentum', 'got_this', 'one_squad')),
  created_at timestamptz not null default now()
);
create index squad_cheers_created_idx on public.squad_cheers (created_at);
comment on table public.squad_cheers is
  'Anonymous in-app cheers (no member, no counts per person). Kept 2 days.';
alter table public.squad_cheers enable row level security;
revoke all on table public.squad_cheers from public, anon, authenticated;
grant select on table public.squad_cheers to anon, authenticated;
grant select, insert, delete on table public.squad_cheers to service_role;
create policy "Recent cheers are public" on public.squad_cheers
  for select to anon, authenticated using (created_at > now() - interval '1 day');

-- Rate limiting only: a hash of a random per-browser id, kept 1 hour.
create table private.cheer_log (
  client_hash bytea not null,
  created_at timestamptz not null default now()
);
create index cheer_log_client_idx on private.cheer_log (client_hash, created_at);
create index cheer_log_created_idx on private.cheer_log (created_at);
alter table private.cheer_log enable row level security;
revoke all on table private.cheer_log from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'squad_cheers'
     ) then
    alter publication supabase_realtime add table public.squad_cheers;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Helpers (time zone aware; never the server's implicit zone)
-- -----------------------------------------------------------------------------
create function private.notify_in_quiet(p_at timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p.quiet_start = p.quiet_end then false
    when p.quiet_start > p.quiet_end then  -- wraps midnight (22:00-08:00)
      (p_at at time zone p.time_zone)::time >= p.quiet_start
      or (p_at at time zone p.time_zone)::time < p.quiet_end
    else
      (p_at at time zone p.time_zone)::time >= p.quiet_start
      and (p_at at time zone p.time_zone)::time < p.quiet_end
  end
  from private.notify_policy p where p.id;
$$;

-- p_at, or the end of the quiet period it falls in.
create function private.notify_next_allowed(p_at timestamptz)
returns timestamptz
language plpgsql stable security definer set search_path = ''
as $$
declare
  p private.notify_policy;
  v_local timestamp;
begin
  select * into p from private.notify_policy where id;
  if not private.notify_in_quiet(p_at) then
    return p_at;
  end if;
  v_local := p_at at time zone p.time_zone;
  if p.quiet_start > p.quiet_end and v_local::time >= p.quiet_start then
    return ((v_local::date + 1) + p.quiet_end) at time zone p.time_zone;
  end if;
  return (v_local::date + p.quiet_end) at time zone p.time_zone;
end;
$$;

-- The campaign month open at p_at (in the campaign's own time zone).
create function private.campaign_month_at(
  p_at timestamptz,
  out campaign_id uuid, out month date, out time_zone text, out target integer
)
language sql stable security definer set search_path = ''
as $$
  select c.id, t.month, c.time_zone, t.target_cases
  from public.campaigns c
  join public.monthly_targets t on t.campaign_id = c.id
  where t.month = date_trunc('month', p_at at time zone c.time_zone)::date
  order by c.starts_on desc
  limit 1;
$$;

-- V1 has one squad: the oldest (same as the dashboard).
create function private.notify_squad()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.squads s order by s.created_at, s.id limit 1;
$$;

-- Same shares as the app's monthMilestones (src/lib/mission.ts) + the rally.
-- rank orders them; when two coincide the higher rank is the one announced.
create function private.milestone_thresholds(p_target integer)
returns table (key text, threshold integer, rank integer, is_rally boolean)
language sql stable security definer set search_path = ''
as $$
  select * from (values
    ('started', 1, 1, false),
    ('halfway', ceil(p_target / 2.0)::integer, 2, false),
    ('momentum', ceil(p_target * 3 / 4.0)::integer, 3, false),
    ('rally', ceil(p_target * (select p.rally_percent from private.notify_policy p where p.id) / 100.0)::integer, 4, true),
    ('cleared', p_target, 5, false)
  ) as t (key, threshold, rank, is_rally)
  where p_target > 0;
$$;

create function private.notify_enqueue(
  p_kind text, p_dedupe text, p_priority smallint, p_at timestamptz,
  p_campaign uuid, p_month date, p_member uuid, p_payload jsonb, p_now timestamptz
)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into private.notification_jobs
    (kind, dedupe_key, priority, scheduled_for, campaign_id, month, squad_member_id, payload, created_at)
  values (p_kind, p_dedupe, p_priority, p_at, p_campaign, p_month, p_member, p_payload, p_now)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id; -- null: that logical notification already exists
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Planner
-- -----------------------------------------------------------------------------

-- Close one activity batch: every not-yet-processed history row of one squad
-- month. Detects milestones/rally from authoritative totals, records each
-- exactly once, and enqueues at most one milestone-or-rally job plus the
-- activity job. Returns what it enqueued.
create function private.close_activity_batch(
  p_squad uuid, p_campaign uuid, p_month date, p_open boolean, p_now timestamptz
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ids bigint[];
  v_net integer;
  v_total integer;
  v_before integer;
  v_target integer;
  v_names text[];
  v_at timestamptz := private.notify_next_allowed(p_now);
  t record;
  v_best_key text;
  v_best_threshold integer;
  v_best_rank integer := 0;
  v_rally boolean := false;
  v_rally_threshold integer;
  v_job bigint;
  v_activity bigint;
  v_payload jsonb;
begin
  -- ONE statement = one snapshot, so the batch rows and the squad total agree
  -- even while other saves are committing.
  with batch as (
    select h.id, h.new_count - h.old_count as delta, h.changed_at
    from public.case_update_history h
    join public.squad_members sm on sm.id = h.squad_member_id
    where sm.squad_id = p_squad and h.campaign_id = p_campaign and h.month = p_month
      and not exists (select 1 from private.notification_activity_items i where i.history_id = h.id)
  )
  select
    array_agg(b.id order by b.changed_at, b.id),
    coalesce(sum(b.delta), 0)::integer,
    (select coalesce(sum(c.case_count), 0)::integer
       from public.member_case_counts c
       join public.squad_members sm on sm.id = c.squad_member_id
      where sm.squad_id = p_squad and c.campaign_id = p_campaign and c.month = p_month)
  into v_ids, v_net, v_total
  from batch b;

  if v_ids is null then
    return 'none';
  end if;
  insert into private.notification_activity_items (history_id, processed_at)
  select unnest(v_ids), p_now;

  v_before := v_total - v_net;
  select mt.target_cases into v_target
  from public.monthly_targets mt where mt.campaign_id = p_campaign and mt.month = p_month;

  -- Who added (net) cases in this batch, A-Z. Names only, never their totals.
  select array_agg(m.display_name order by lower(m.display_name), m.display_name)
  into v_names
  from (
    select h.squad_member_id, sum(h.new_count - h.old_count) as d
    from public.case_update_history h where h.id = any (v_ids)
    group by h.squad_member_id
  ) x
  join public.squad_members sm on sm.id = x.squad_member_id
  join public.members m on m.id = sm.member_id
  where x.d > 0;

  -- Milestones and rally, each recorded once (primary key).
  for t in
    select th.key, th.threshold, th.rank, th.is_rally, hit.id as hit_id, hit.changed_at as hit_at
    from private.milestone_thresholds(coalesce(v_target, 0)) th
    left join lateral (
      select r.id, r.changed_at
      from (
        select h.id, h.changed_at,
          v_before + sum(h.new_count - h.old_count) over (order by h.changed_at, h.id) as running
        from public.case_update_history h where h.id = any (v_ids)
      ) r
      where r.running >= th.threshold
      order by r.changed_at, r.id
      limit 1
    ) hit on true
    where not exists (
      select 1 from private.notification_milestones nm
      where nm.squad_id = p_squad and nm.campaign_id = p_campaign and nm.month = p_month and nm.key = th.key
    )
    order by th.rank
  loop
    if v_before >= t.threshold then
      -- Already there before this batch (e.g. the target was lowered): never announced.
      insert into private.notification_milestones (squad_id, campaign_id, month, key, threshold, status, recorded_at)
      values (p_squad, p_campaign, p_month, t.key, t.threshold, 'silent', p_now)
      on conflict do nothing;
    elsif t.hit_id is not null then
      insert into private.notification_milestones
        (squad_id, campaign_id, month, key, threshold, status, crossed_at, history_id, recorded_at)
      values (p_squad, p_campaign, p_month, t.key, t.threshold,
              case when p_open then 'covered' else 'stale' end, t.hit_at, t.hit_id, p_now)
      on conflict do nothing;
      if t.is_rally then
        v_rally := true;
        v_rally_threshold := t.threshold;
      elsif t.rank > v_best_rank then
        v_best_rank := t.rank;
        v_best_key := t.key;
        v_best_threshold := t.threshold;
      end if;
    end if;
  end loop;

  -- A milestone beats a rally from the same batch; a closed month still gets
  -- its milestone (e.g. "October cleared" just before midnight), not a rally.
  if v_best_key is not null then
    v_payload := jsonb_build_object(
      'month', p_month, 'key', v_best_key, 'threshold', v_best_threshold,
      'total', v_total, 'target', v_target, 'names', coalesce(to_jsonb(v_names), '[]'::jsonb));
    v_job := private.notify_enqueue('milestone',
      format('milestone:%s:%s:%s:%s', p_squad, p_campaign, p_month, v_best_key),
      1::smallint, v_at, p_campaign, p_month, null, v_payload, p_now);
    update private.notification_milestones
       set status = 'notified', job_id = v_job
     where squad_id = p_squad and campaign_id = p_campaign and month = p_month and key = v_best_key;
  elsif v_rally and p_open then
    v_payload := jsonb_build_object(
      'month', p_month, 'threshold', v_rally_threshold,
      'total', v_total, 'target', v_target, 'names', coalesce(to_jsonb(v_names), '[]'::jsonb));
    v_job := private.notify_enqueue('rally',
      format('rally:%s:%s:%s', p_squad, p_campaign, p_month),
      0::smallint, v_at, p_campaign, p_month, null, v_payload, p_now);
    update private.notification_milestones
       set status = 'notified', job_id = v_job
     where squad_id = p_squad and campaign_id = p_campaign and month = p_month and key = 'rally';
  end if;

  -- Routine activity (open month, someone added cases). When a milestone or
  -- rally covers this batch, the activity job only goes to phones that turned
  -- milestone alerts off, so every phone hears about the batch at most once.
  if p_open and v_names is not null then
    v_activity := private.notify_enqueue('activity',
      format('activity:%s:%s', p_squad, v_ids[1]),
      0::smallint, v_at, p_campaign, p_month, null,
      jsonb_build_object(
        'month', p_month, 'total', v_total, 'target', v_target,
        'names', to_jsonb(v_names), 'covered', v_job is not null),
      p_now);
  end if;

  update private.notification_activity_items
     set job_id = coalesce(v_job, v_activity)
   where history_id = any (v_ids);

  return case
    when v_best_key is not null then 'milestone'
    when v_job is not null then 'rally'
    when v_activity is not null then 'activity'
    else 'none'
  end;
end;
$$;

create function private.plan_notifications(p_now timestamptz default now())
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pol private.notify_policy;
  v_squad uuid;
  v_quiet boolean;
  cm record;
  g record;
  r record;
  v_last record;
  v_open boolean;
  v_batches integer := 0;
  v_reminders integer := 0;
  v_recap text;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_due timestamptz;
  v_seq integer;
  v_at timestamptz;
  v_job bigint;
  v_local timestamp;
  v_week timestamp;
  v_send timestamp;
  v_from timestamptz;
  v_to timestamptz;
  v_key text;
  v_net integer;
  v_total integer;
  v_milestones jsonb;
begin
  -- One planner at a time; the unique keys are the second line of defence.
  perform pg_advisory_xact_lock(hashtext('cjo:notify:plan'));
  select * into pol from private.notify_policy where id;
  v_squad := private.notify_squad();
  if v_squad is null then
    return jsonb_build_object('squad', false);
  end if;
  v_quiet := private.notify_in_quiet(p_now);
  select * into cm from private.campaign_month_at(p_now);

  -- 1. Activity batches (never closed during quiet hours: overnight activity
  --    becomes one morning update). History from other squads is skipped.
  insert into private.notification_activity_items (history_id, processed_at)
  select h.id, p_now
  from public.case_update_history h
  join public.squad_members sm on sm.id = h.squad_member_id
  where sm.squad_id <> v_squad
    and not exists (select 1 from private.notification_activity_items i where i.history_id = h.id);

  if not v_quiet then
    for g in
      select h.campaign_id, h.month, min(h.changed_at) as first_at
      from public.case_update_history h
      join public.squad_members sm on sm.id = h.squad_member_id
      where sm.squad_id = v_squad
        and not exists (select 1 from private.notification_activity_items i where i.history_id = h.id)
      group by h.campaign_id, h.month
    loop
      v_open := cm.month is not null and g.campaign_id = cm.campaign_id and g.month = cm.month;
      -- The open month waits for its consolidation window; a closed month is
      -- wrapped up straight away.
      continue when v_open and g.first_at > p_now - pol.activity_window;
      if private.close_activity_batch(v_squad, g.campaign_id, g.month, v_open, p_now) <> 'none' then
        v_batches := v_batches + 1;
      end if;
    end loop;
  end if;

  -- 2. Private check-in reminders (one slot at a time, so an outage never
  --    releases a burst of missed reminders).
  if cm.month is not null and pol.reminder_cap > 0 and cm.month >= pol.reminders_from then
    v_month_start := cm.month::timestamp at time zone cm.time_zone;
    v_month_end := (cm.month + interval '1 month')::timestamp at time zone cm.time_zone;
    for r in
      select sm.id as member_id, m.display_name
      from public.squad_members sm
      join public.members m on m.id = sm.member_id
      where sm.squad_id = v_squad
        and not exists (
          select 1 from public.member_checkins mc
          where mc.squad_member_id = sm.id and mc.campaign_id = cm.campaign_id and mc.month = cm.month)
        and exists (
          select 1 from public.push_subscriptions ps
          where ps.squad_member_id = sm.id and ps.pref_reminders
            and ps.linked_at <= p_now - pol.reminder_link_grace)
      order by sm.id
    loop
      select cr.seq, coalesce(cr.sent_at, j.scheduled_for, cr.due_at) as anchor, j.status
      into v_last
      from private.checkin_reminders cr
      left join private.notification_jobs j on j.id = cr.job_id
      where cr.squad_member_id = r.member_id and cr.campaign_id = cm.campaign_id and cr.month = cm.month
      order by cr.seq desc
      limit 1;

      if v_last.seq is null then
        v_seq := 1;
        v_due := v_month_start + pol.reminder_first_after;
      else
        continue when v_last.status in ('pending', 'claimed');
        v_seq := v_last.seq + 1;
        v_due := v_last.anchor + pol.reminder_every;
      end if;
      continue when v_seq > pol.reminder_cap or p_now < v_due;
      v_at := private.notify_next_allowed(p_now);
      continue when v_at >= v_month_end; -- would land in the next month: not useful

      insert into private.checkin_reminders (squad_member_id, campaign_id, month, seq, due_at, created_at)
      values (r.member_id, cm.campaign_id, cm.month, v_seq, v_due, p_now)
      on conflict do nothing;
      continue when not found;
      v_job := private.notify_enqueue('reminder',
        format('reminder:%s:%s:%s:%s', r.member_id, cm.campaign_id, cm.month, v_seq),
        0::smallint, v_at, cm.campaign_id, cm.month, r.member_id,
        jsonb_build_object('month', cm.month, 'name', r.display_name, 'seq', v_seq), p_now);
      update private.checkin_reminders set job_id = v_job
       where squad_member_id = r.member_id and campaign_id = cm.campaign_id
         and month = cm.month and seq = v_seq;
      v_reminders := v_reminders + 1;
    end loop;
  end if;

  -- 3. Weekly recap of the previous Monday-Sunday (policy day/time, local).
  v_local := p_now at time zone pol.time_zone;
  v_week := date_trunc('week', v_local); -- this Monday 00:00 local
  v_send := v_week + (pol.recap_dow - 1) * interval '1 day' + pol.recap_time;
  if v_local >= v_send then
    v_key := format('recap:%s:%s', v_squad, (v_week - interval '7 days')::date);
    if not exists (select 1 from private.notification_jobs j where j.dedupe_key = v_key) then
      v_from := (v_week - interval '7 days') at time zone pol.time_zone;
      v_to := v_week at time zone pol.time_zone;
      -- One statement: the week's net change and the month's total agree.
      select
        coalesce(sum(h.new_count - h.old_count), 0)::integer,
        (select coalesce(sum(c.case_count), 0)::integer
           from public.member_case_counts c
           join public.squad_members sm2 on sm2.id = c.squad_member_id
          where sm2.squad_id = v_squad and c.campaign_id = cm.campaign_id and c.month = cm.month)
      into v_net, v_total
      from public.case_update_history h
      join public.squad_members sm on sm.id = h.squad_member_id
      where sm.squad_id = v_squad and h.changed_at >= v_from and h.changed_at < v_to;

      select coalesce(jsonb_agg(jsonb_build_object('key', nm.key, 'month', nm.month)
                                order by nm.crossed_at, nm.threshold), '[]'::jsonb)
      into v_milestones
      from private.notification_milestones nm
      where nm.squad_id = v_squad and nm.status in ('notified', 'covered', 'stale')
        and nm.key <> 'rally' and nm.crossed_at >= v_from and nm.crossed_at < v_to;

      v_recap := case
        when v_local >= v_send + pol.stale_other then 'stale'   -- missed by a day: skip
        when cm.month is null then 'no_campaign'
        when v_net <= 0 and jsonb_array_length(v_milestones) = 0 then 'empty'
        else 'pending'
      end;
      v_job := private.notify_enqueue('recap', v_key, 0::smallint,
        private.notify_next_allowed(p_now), cm.campaign_id, cm.month, null,
        jsonb_build_object(
          'week_start', (v_week - interval '7 days')::date, 'week_end', (v_week - interval '1 day')::date,
          'net', v_net, 'milestones', v_milestones,
          'month', cm.month, 'total', v_total, 'target', cm.target),
        p_now);
      if v_recap <> 'pending' then
        update private.notification_jobs
           set status = 'cancelled', reason = v_recap, finished_at = p_now
         where id = v_job;
      end if;
    end if;
  end if;

  -- 4. Retention.
  delete from private.notification_jobs
   where status in ('done', 'failed', 'cancelled') and created_at < p_now - pol.job_retention;
  delete from public.squad_cheers where created_at < p_now - pol.cheer_retention;
  delete from private.cheer_log where created_at < p_now - interval '1 hour';

  return jsonb_build_object('squad', true, 'quiet', v_quiet, 'batches', v_batches,
                            'reminders', v_reminders, 'recap', v_recap);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Claim (atomic; overlapping workers never get the same job)
-- -----------------------------------------------------------------------------

-- Why a due job should no longer be sent, or null. Re-checked at send time.
create function private.notify_cancel_reason(j private.notification_jobs, p_now timestamptz)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  pol private.notify_policy;
  cm record;
begin
  select * into pol from private.notify_policy where id;
  select * into cm from private.campaign_month_at(p_now);
  if j.kind = 'activity' then
    if j.created_at < p_now - pol.stale_activity then return 'stale'; end if;
    return null;
  end if;
  if j.created_at < p_now - pol.stale_other then return 'stale'; end if;
  if j.kind = 'rally' then
    if cm.month is distinct from j.month or cm.campaign_id is distinct from j.campaign_id then
      return 'stale';
    end if;
    if exists (
      select 1 from private.notification_jobs m
      where m.kind = 'milestone' and m.campaign_id = j.campaign_id and m.month = j.month
        and m.status <> 'cancelled' and m.id > j.id
    ) then
      return 'covered';
    end if;
  elsif j.kind = 'reminder' then
    if j.squad_member_id is null then return 'ineligible'; end if;
    if cm.month is distinct from j.month or cm.campaign_id is distinct from j.campaign_id then
      return 'stale';
    end if;
    if exists (
      select 1 from public.member_checkins mc
      where mc.squad_member_id = j.squad_member_id and mc.campaign_id = j.campaign_id and mc.month = j.month
    ) then
      return 'confirmed';
    end if;
  end if;
  return null;
end;
$$;

-- Does this phone want this job? (category preference + private routing)
create function private.notify_device_wants(j private.notification_jobs, s public.push_subscriptions)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case j.kind
    when 'activity' then s.pref_activity
      and not (coalesce((j.payload ->> 'covered')::boolean, false) and s.pref_milestones)
    when 'milestone' then s.pref_milestones
    when 'rally' then s.pref_milestones
    when 'reminder' then s.pref_reminders and s.squad_member_id = j.squad_member_id
    when 'recap' then s.pref_recap
    else false
  end;
$$;

create function private.claim_notifications(p_now timestamptz, p_limit integer)
returns table (job_id bigint, claim_token uuid, kind text, payload jsonb, recipients jsonb)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  pol private.notify_policy;
  j private.notification_jobs;
  v_reason text;
  v_recipients jsonb;
  v_token uuid;
begin
  -- Nothing is sent during quiet hours, whatever its priority.
  if private.notify_in_quiet(p_now) then
    return;
  end if;
  select * into pol from private.notify_policy where id;
  for j in
    select * from private.notification_jobs nj
    where (nj.status = 'pending' and nj.scheduled_for <= p_now)
       or (nj.status = 'claimed' and nj.lease_until < p_now)  -- a worker died mid-send
    order by nj.priority desc, nj.scheduled_for, nj.id
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update skip locked
  loop
    v_reason := private.notify_cancel_reason(j, p_now);
    if v_reason is null and j.attempts >= pol.max_attempts then
      v_reason := 'attempts_exhausted';
    end if;
    if v_reason is not null then
      update private.notification_jobs
         set status = case when v_reason = 'attempts_exhausted' then 'failed' else 'cancelled' end,
             reason = v_reason, finished_at = p_now, claim_token = null, lease_until = null
       where id = j.id;
      continue;
    end if;

    select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
                     order by s.created_at)
    into v_recipients
    from public.push_subscriptions s
    where private.notify_device_wants(j, s)
      and not exists (
        select 1 from private.notification_deliveries d
        where d.job_id = j.id and d.subscription_id = s.id and d.status in ('accepted', 'rejected'));

    if v_recipients is null then
      update private.notification_jobs
         set status = case when j.kind = 'reminder' and j.attempts = 0 then 'cancelled' else 'done' end,
             reason = case when j.attempts = 0 then 'no_recipients' else reason end,
             finished_at = p_now, claim_token = null, lease_until = null
       where id = j.id;
      continue;
    end if;

    v_token := gen_random_uuid();
    update private.notification_jobs
       set status = 'claimed', claim_token = v_token, lease_until = p_now + pol.claim_lease,
           attempts = attempts + 1, last_attempt_at = p_now
     where id = j.id;
    job_id := j.id;
    claim_token := v_token;
    kind := j.kind;
    payload := j.payload;
    recipients := v_recipients;
    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Complete (record results; bounded retries with backoff)
-- -----------------------------------------------------------------------------
-- p_results: [{ "id": subscription uuid, "outcome": accepted|gone|retry|rejected, "code": int }]
--   accepted  push service took it          gone      404/410: device removed
--   retry     network/429/5xx: try again    rejected  payload/config error: not retried
create function private.complete_notification(
  p_job_id bigint, p_claim_token uuid, p_results jsonb, p_now timestamptz
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pol private.notify_policy;
  j private.notification_jobs;
  r jsonb;
  v_sub uuid;
  v_outcome text;
  v_retry integer := 0;
  v_status text;
  v_gone uuid[] := '{}';
begin
  select * into pol from private.notify_policy where id;
  select * into j from private.notification_jobs where id = p_job_id for update;
  if not found or j.status <> 'claimed' or j.claim_token is distinct from p_claim_token then
    return 'stale_claim'; -- lease expired and another worker owns it now
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'results must be an array' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_results) loop
    v_outcome := r ->> 'outcome';
    if v_outcome not in ('accepted', 'gone', 'retry', 'rejected') then
      raise exception 'unknown outcome' using errcode = '22023';
    end if;
    begin
      v_sub := (r ->> 'id')::uuid;
    exception when others then
      raise exception 'bad subscription id' using errcode = '22023';
    end;
    insert into private.notification_deliveries
      (job_id, subscription_id, push_service, status, last_code, updated_at)
    select j.id, s.id, substring(s.endpoint from '^https://([^/]+)/'), v_outcome,
           nullif(r ->> 'code', '')::integer, p_now
    from public.push_subscriptions s where s.id = v_sub
    on conflict (job_id, subscription_id) do update
      set status = excluded.status, last_code = excluded.last_code,
          attempts = private.notification_deliveries.attempts + 1, updated_at = p_now;
    if found then
      if v_outcome = 'retry' then v_retry := v_retry + 1; end if;
      if v_outcome = 'gone' then v_gone := v_gone || v_sub; end if;
    end if;
  end loop;

  -- Only devices the push service reported as gone are removed.
  delete from public.push_subscriptions where id = any (v_gone);

  if v_retry > 0 and j.attempts < pol.max_attempts then
    v_status := 'pending';
  elsif v_retry > 0 then
    v_status := 'failed';
  else
    v_status := 'done';
  end if;

  update private.notification_jobs nj
     set status = v_status,
         reason = case v_status when 'pending' then 'retrying' when 'failed' then 'attempts_exhausted' else null end,
         scheduled_for = case when v_status = 'pending'
           then private.notify_next_allowed(
             p_now + (array[1, 5, 15, 60, 60, 60, 60, 60, 60, 60])[least(j.attempts, 10)] * interval '1 minute')
           else nj.scheduled_for end,
         finished_at = case when v_status = 'pending' then null else p_now end,
         claim_token = null, lease_until = null,
         accepted_count = (select count(*) from private.notification_deliveries d where d.job_id = j.id and d.status = 'accepted'),
         gone_count = (select count(*) from private.notification_deliveries d where d.job_id = j.id and d.status = 'gone'),
         failed_count = (select count(*) from private.notification_deliveries d where d.job_id = j.id and d.status in ('retry', 'rejected'))
   where nj.id = j.id;

  if j.kind = 'reminder' then
    update private.checkin_reminders
       set sent_at = coalesce(sent_at, p_now)
     where job_id = j.id
       and exists (select 1 from private.notification_deliveries d where d.job_id = j.id and d.status = 'accepted');
  end if;
  return v_status;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Public API
-- -----------------------------------------------------------------------------

-- Server (needs PUSH_SECRET, like push_devices).
create function public.notify_plan(p_secret text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return private.plan_notifications(now());
end;
$$;

create function public.notify_claim(p_secret text, p_limit integer default 10)
returns table (job_id bigint, claim_token uuid, kind text, payload jsonb, recipients jsonb)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select * from private.claim_notifications(now(), p_limit);
end;
$$;

create function public.notify_complete(p_secret text, p_job_id bigint, p_claim_token uuid, p_results jsonb)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return private.complete_notification(p_job_id, p_claim_token, p_results, now());
end;
$$;

-- Browser: this phone's settings. Knowing the endpoint = holding the phone.
create function public.get_push_device_settings(p_endpoint text)
returns table (squad_member_id uuid, activity boolean, milestones boolean, reminders boolean, recap boolean)
language sql stable security definer set search_path = ''
as $$
  select s.squad_member_id, s.pref_activity, s.pref_milestones, s.pref_reminders, s.pref_recap
  from public.push_subscriptions s where s.endpoint = p_endpoint;
$$;

-- Link this phone to a member (null = unlink). Routing for private reminders.
create function public.set_push_device_member(p_endpoint text, p_squad_member_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_squad_member_id is not null
     and not exists (select 1 from public.squad_members where id = p_squad_member_id) then
    raise exception 'unknown squad member' using errcode = '42704';
  end if;
  update public.push_subscriptions
     set linked_at = case when squad_member_id is distinct from p_squad_member_id
                          then case when p_squad_member_id is null then null else now() end
                          else linked_at end,
         squad_member_id = p_squad_member_id
   where endpoint = p_endpoint;
  if not found then
    raise exception 'unknown device' using errcode = 'P0002';
  end if;
end;
$$;

create function public.set_push_device_prefs(
  p_endpoint text, p_activity boolean, p_milestones boolean, p_reminders boolean, p_recap boolean
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_activity is null or p_milestones is null or p_reminders is null or p_recap is null then
    raise exception 'every preference is required' using errcode = '22004';
  end if;
  update public.push_subscriptions
     set pref_activity = p_activity, pref_milestones = p_milestones,
         pref_reminders = p_reminders, pref_recap = p_recap
   where endpoint = p_endpoint;
  if not found then
    raise exception 'unknown device' using errcode = 'P0002';
  end if;
end;
$$;

-- Confirm a member's count for the open month (zero allowed). The count must
-- match the stored total, so a confirmation always describes the board.
-- Cancels that member's queued reminders for the month.
create function private.confirm_checkin_at(p_squad_member_id uuid, p_case_count integer, p_now timestamptz)
returns table (status text, month date, case_count integer, confirmed_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_found uuid;
  cm record;
  v_current integer;
  v_at timestamptz;
begin
  if p_case_count is null or p_case_count < 0 or p_case_count > 1000 then
    raise exception 'case count must be between 0 and 1000' using errcode = '23514';
  end if;
  select sm.id into v_found from public.squad_members sm where sm.id = p_squad_member_id for update;
  if v_found is null then
    raise exception 'unknown squad member' using errcode = '42704';
  end if;
  select * into cm from private.campaign_month_at(p_now);
  if cm.month is null then
    raise exception 'no campaign month is open' using errcode = 'P0002';
  end if;
  select coalesce(
    (select c.case_count from public.member_case_counts c
      where c.squad_member_id = v_found and c.campaign_id = cm.campaign_id and c.month = cm.month), 0)
  into v_current;
  if v_current <> p_case_count then
    return query select 'conflict'::text, cm.month, v_current, null::timestamptz;
    return;
  end if;

  insert into public.member_checkins (squad_member_id, campaign_id, month, confirmed_count, confirmed_at)
  values (v_found, cm.campaign_id, cm.month, v_current, p_now)
  on conflict on constraint member_checkins_pkey
    do update set confirmed_count = excluded.confirmed_count, confirmed_at = excluded.confirmed_at
  returning member_checkins.confirmed_at into v_at;

  update private.notification_jobs j
     set status = 'cancelled', reason = 'confirmed', finished_at = p_now
   where j.kind = 'reminder' and j.status = 'pending' and j.squad_member_id = v_found
     and j.campaign_id = cm.campaign_id and j.month = cm.month;

  return query select 'confirmed'::text, cm.month, v_current, v_at;
end;
$$;

create function public.confirm_checkin(p_squad_member_id uuid, p_case_count integer)
returns table (status text, month date, case_count integer, confirmed_at timestamptz)
language sql volatile security definer set search_path = ''
as $$
  select * from private.confirm_checkin_at(p_squad_member_id, p_case_count, now());
$$;

-- One member's check-in for the open month (the app asks only for the member
-- linked on this phone; there is deliberately no "who hasn't checked in" list).
create function public.get_checkin(p_squad_member_id uuid)
returns table (month date, confirmed boolean, confirmed_count integer, confirmed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select cm.month, mc.squad_member_id is not null, mc.confirmed_count, mc.confirmed_at
  from private.campaign_month_at(now()) cm
  left join public.member_checkins mc
    on mc.squad_member_id = p_squad_member_id and mc.campaign_id = cm.campaign_id and mc.month = cm.month
  where cm.month is not null;
$$;

-- Send an anonymous cheer. p_client: a random id kept by this browser (only
-- its hash is stored, for 1 hour, to rate-limit). Returns sent | too_fast | busy.
create function public.send_cheer(p_cheer text, p_client text)
returns table (status text, id bigint)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  pol private.notify_policy;
  v_hash bytea;
  v_squad uuid;
  v_id bigint;
begin
  if p_cheer is null or p_cheer not in ('lets_go', 'momentum', 'got_this', 'one_squad') then
    raise exception 'unknown cheer' using errcode = '22023';
  end if;
  if p_client is null or char_length(p_client) not between 16 and 100 then
    raise exception 'bad client id' using errcode = '22023';
  end if;
  select * into pol from private.notify_policy where id;
  v_squad := private.notify_squad();
  if v_squad is null then
    raise exception 'no squad' using errcode = 'P0002';
  end if;
  v_hash := sha256(convert_to(p_client, 'UTF8'));
  perform pg_advisory_xact_lock(hashtext('cjo:cheer'));
  if exists (select 1 from private.cheer_log l where l.client_hash = v_hash and l.created_at > now() - pol.cheer_gap)
     or (select count(*) from private.cheer_log l
          where l.client_hash = v_hash and l.created_at > now() - interval '1 minute') >= pol.cheer_client_per_minute then
    return query select 'too_fast'::text, null::bigint;
    return;
  end if;
  if (select count(*) from private.cheer_log l where l.created_at > now() - interval '1 minute')
     >= pol.cheer_squad_per_minute then
    return query select 'busy'::text, null::bigint;
    return;
  end if;
  insert into private.cheer_log (client_hash) values (v_hash);
  insert into public.squad_cheers (squad_id, cheer) values (v_squad, p_cheer) returning squad_cheers.id into v_id;
  return query select 'sent'::text, v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Backfill: nothing that already happened is ever announced
-- -----------------------------------------------------------------------------
insert into private.notification_activity_items (history_id)
select h.id from public.case_update_history h;

insert into private.notification_milestones (squad_id, campaign_id, month, key, threshold, status)
select p.squad_id, p.campaign_id, p.month, th.key, th.threshold, 'silent'
from public.squad_monthly_progress p
cross join lateral private.milestone_thresholds(p.target_cases) th
where p.total_cases >= th.threshold;

-- -----------------------------------------------------------------------------
-- 12. Grants
-- -----------------------------------------------------------------------------
revoke all on function private.notify_in_quiet(timestamptz) from public;
revoke all on function private.notify_next_allowed(timestamptz) from public;
revoke all on function private.campaign_month_at(timestamptz) from public;
revoke all on function private.notify_squad() from public;
revoke all on function private.milestone_thresholds(integer) from public;
revoke all on function private.notify_enqueue(text, text, smallint, timestamptz, uuid, date, uuid, jsonb, timestamptz) from public;
revoke all on function private.close_activity_batch(uuid, uuid, date, boolean, timestamptz) from public;
revoke all on function private.plan_notifications(timestamptz) from public;
revoke all on function private.notify_cancel_reason(private.notification_jobs, timestamptz) from public;
revoke all on function private.notify_device_wants(private.notification_jobs, public.push_subscriptions) from public;
revoke all on function private.claim_notifications(timestamptz, integer) from public;
revoke all on function private.complete_notification(bigint, uuid, jsonb, timestamptz) from public;
revoke all on function private.confirm_checkin_at(uuid, integer, timestamptz) from public;

revoke all on function public.notify_plan(text) from public;
revoke all on function public.notify_claim(text, integer) from public;
revoke all on function public.notify_complete(text, bigint, uuid, jsonb) from public;
revoke all on function public.get_push_device_settings(text) from public;
revoke all on function public.set_push_device_member(text, uuid) from public;
revoke all on function public.set_push_device_prefs(text, boolean, boolean, boolean, boolean) from public;
revoke all on function public.confirm_checkin(uuid, integer) from public;
revoke all on function public.get_checkin(uuid) from public;
revoke all on function public.send_cheer(text, text) from public;

grant execute on function public.notify_plan(text) to anon, authenticated, service_role;
grant execute on function public.notify_claim(text, integer) to anon, authenticated, service_role;
grant execute on function public.notify_complete(text, bigint, uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.get_push_device_settings(text) to anon, authenticated, service_role;
grant execute on function public.set_push_device_member(text, uuid) to anon, authenticated, service_role;
grant execute on function public.set_push_device_prefs(text, boolean, boolean, boolean, boolean) to anon, authenticated, service_role;
grant execute on function public.confirm_checkin(uuid, integer) to anon, authenticated, service_role;
grant execute on function public.get_checkin(uuid) to anon, authenticated, service_role;
grant execute on function public.send_cheer(text, text) to anon, authenticated, service_role;
