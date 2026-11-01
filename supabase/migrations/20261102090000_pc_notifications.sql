-- =============================================================================
-- PC$ push notifications, on the existing outbox (notifications_v2): same
-- claim / deliver / retry / quiet hours / preferences. No second system.
--
-- * Every PC$ save that stores something queues ONE job in the same
--   transaction (a failed or rolled-back save queues nothing; a retry of the
--   same values stores nothing, so it queues nothing). Idempotency key:
--   'pc:<challenge>:<first history row of the save>'.
-- * pc_activity: who changed and their new cumulative amount (increase or
--   correction), plus the squad total from the database.
-- * pc_milestone: the same, when the save also crossed a milestone:
--     minimum  a member goes from below the individual minimum to at or above
--     target   the squad's saved total first reaches the official target
--   Each is recorded ONCE per challenge in private.pc_milestones (per member
--   for minimum, once for the squad for target). Policy: a correction below
--   and a later re-crossing never notifies again (like case milestones).
-- * Saves are serialised per challenge (advisory lock), so milestone checks
--   see every committed amount and concurrent saves can't both miss or both
--   announce a crossing.
-- * A job not yet picked up (e.g. queued during quiet hours) absorbs later
--   saves: overnight PC$ saves become one morning notification.
-- * Never names who typed the change (no login): only whose amount it is.
-- =============================================================================

alter table private.notification_jobs drop constraint notification_jobs_kind_check;
alter table private.notification_jobs add constraint notification_jobs_kind_check
  check (kind in ('activity', 'milestone', 'rally', 'reminder', 'recap', 'pc_activity', 'pc_milestone'));

create table private.pc_milestones (
  id bigint generated always as identity primary key,
  challenge_id uuid not null references public.pc_challenges (id) on delete cascade,
  key text not null check (key in ('minimum', 'target')),
  -- The member for 'minimum'; null for the squad 'target'.
  squad_member_id uuid references public.squad_members (id) on delete cascade,
  amount bigint not null,
  reached_at timestamptz not null,
  constraint pc_milestones_member_key check ((key = 'minimum') = (squad_member_id is not null))
);
create unique index pc_milestones_once on private.pc_milestones (challenge_id, key, squad_member_id) nulls not distinct;
alter table private.pc_milestones enable row level security;
revoke all on table private.pc_milestones from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Queue the notification for one PC$ save (called inside the save).
-- p_after: the last history id before the save; rows after it are this save.
-- -----------------------------------------------------------------------------
create function private.pc_enqueue(c public.pc_challenges, p_after bigint, p_now timestamptz)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_first bigint;
  v_updates jsonb;
  v_min jsonb := '[]';
  v_total bigint;
  v_target boolean := false;
  v_everyone boolean;
  v_squad uuid := private.notify_squad();
  v_kind text;
  v_payload jsonb;
  v_name text;
  j private.notification_jobs;
  u jsonb;
begin
  select min(h.id) into v_first from private.pc_amount_history h where h.challenge_id = c.id and h.id > p_after;
  if v_first is null then
    return null; -- nothing stored (unchanged, conflict): no notification
  end if;

  -- Per member: amount before this save -> after it (authoritative history rows).
  select jsonb_agg(jsonb_build_object('id', x.member, 'name', x.name, 'old', x.old_amount, 'new', x.new_amount)
                   order by x.name, x.member)
  into v_updates
  from (
    select h.squad_member_id as member, m.display_name as name,
           (array_agg(h.old_amount order by h.id))[1] as old_amount,
           (array_agg(h.new_amount order by h.id desc))[1] as new_amount
    from private.pc_amount_history h
    join public.squad_members sm on sm.id = h.squad_member_id
    join public.members m on m.id = sm.member_id
    where h.challenge_id = c.id and h.id > p_after
    group by h.squad_member_id, m.display_name
  ) x;

  -- Individual minimum: crossed from below to at or above, first time only.
  for u in select * from jsonb_array_elements(v_updates)
  loop
    if coalesce((u ->> 'old')::bigint, 0) < c.member_minimum and (u ->> 'new')::bigint >= c.member_minimum then
      insert into private.pc_milestones (challenge_id, key, squad_member_id, amount, reached_at)
      values (c.id, 'minimum', (u ->> 'id')::uuid, (u ->> 'new')::bigint, p_now)
      on conflict do nothing
      returning u ->> 'name' into v_name;
      if v_name is not null then
        v_min := v_min || to_jsonb(v_name);
        v_name := null;
      end if;
    end if;
  end loop;

  -- Squad total from saved amounts (this squad's members), and the target.
  select coalesce(sum(a.amount), 0) into v_total
  from public.member_pc_amounts a
  join public.squad_members sm on sm.id = a.squad_member_id and sm.squad_id = v_squad
  where a.challenge_id = c.id;
  if v_total >= c.target_amount then
    insert into private.pc_milestones (challenge_id, key, squad_member_id, amount, reached_at)
    values (c.id, 'target', null, v_total, p_now)
    on conflict do nothing
    returning true into v_target;
    v_target := coalesce(v_target, false);
  end if;
  v_everyone := exists (select 1 from public.squad_members sm where sm.squad_id = v_squad)
    and not exists (
      select 1 from public.squad_members sm
      left join public.member_pc_amounts a on a.squad_member_id = sm.id and a.challenge_id = c.id
      where sm.squad_id = v_squad and coalesce(a.amount, 0) < c.member_minimum);

  v_kind := case when jsonb_array_length(v_min) > 0 or v_target then 'pc_milestone' else 'pc_activity' end;
  v_payload := jsonb_build_object(
    'challenge', c.id,
    'month', to_char(date_trunc('month', c.eligible_from), 'YYYY-MM-DD'),
    'target', c.target_amount,
    'minimum', c.member_minimum,
    'total', v_total,
    'everyone_minimum', v_everyone,
    'updates', v_updates,
    'minimum_reached', v_min,
    'target_reached', v_target,
    'events', jsonb_build_array('pc:' || c.id || ':' || v_first));

  -- A job nobody has picked up yet (e.g. waiting out quiet hours) absorbs this save.
  select * into j from private.notification_jobs nj
  where nj.kind in ('pc_activity', 'pc_milestone') and nj.status = 'pending' and nj.attempts = 0
    and nj.payload ->> 'challenge' = c.id::text
  order by nj.id desc
  limit 1
  for update skip locked;

  if found then
    update private.notification_jobs
       set kind = case when kind = 'pc_milestone' or v_kind = 'pc_milestone' then 'pc_milestone' else 'pc_activity' end,
           priority = case when kind = 'pc_milestone' or v_kind = 'pc_milestone' then 1 else 0 end,
           payload = v_payload || jsonb_build_object(
             'updates', (
               select jsonb_agg(jsonb_build_object(
                        'id', coalesce(n ->> 'id', e ->> 'id'),
                        'name', coalesce(n ->> 'name', e ->> 'name'),
                        'old', case when e is not null then e -> 'old' else n -> 'old' end,
                        'new', coalesce(n -> 'new', e -> 'new'))
                      order by coalesce(n ->> 'name', e ->> 'name'), coalesce(n ->> 'id', e ->> 'id'))
               from jsonb_array_elements(payload -> 'updates') e
               full join jsonb_array_elements(v_updates) n on n ->> 'id' = e ->> 'id'),
             'minimum_reached', coalesce(payload -> 'minimum_reached', '[]') || v_min,
             'target_reached', coalesce((payload ->> 'target_reached')::boolean, false) or v_target,
             'events', coalesce(payload -> 'events', '[]') || (v_payload -> 'events'))
     where id = j.id;
    return j.id;
  end if;

  return private.notify_enqueue(
    v_kind, 'pc:' || c.id || ':' || v_first, (case when v_kind = 'pc_milestone' then 1 else 0 end)::smallint,
    private.notify_next_allowed(p_now), c.campaign_id, date_trunc('month', c.eligible_from)::date, null,
    v_payload, p_now);
end;
$$;

-- -----------------------------------------------------------------------------
-- The save: same checks and results as before, now at a given time (tests use a
-- fake clock), serialised per challenge, and queueing its notification.
-- -----------------------------------------------------------------------------
create function private.submit_pc_amounts_at(p_challenge_id uuid, p_entries jsonb, p_now timestamptz)
returns table (squad_member_id uuid, status text, amount bigint)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.pc_challenges;
  e record;
  v_count integer;
  v_current bigint;
  v_after bigint;
begin
  select * into c from public.pc_challenges pc where pc.id = p_challenge_id;
  if not found then
    raise exception 'unknown PC$ challenge' using errcode = '42704';
  end if;
  if p_now < c.opens_at or p_now >= c.closes_at then
    raise exception 'PC$ entries are closed' using errcode = 'P0002';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'entries must be a JSON array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_entries);
  if v_count < 1 or v_count > 100 then
    raise exception 'between 1 and 100 entries per save' using errcode = '22023';
  end if;
  if (select count(distinct x ->> 'squad_member_id') from jsonb_array_elements(p_entries) x) <> v_count then
    raise exception 'each member at most once per save' using errcode = '22023';
  end if;

  -- One PC$ save at a time per challenge: milestone checks see every committed amount.
  perform pg_advisory_xact_lock(hashtext('cjo:pc:' || c.id::text));
  select coalesce(max(h.id), 0) into v_after from private.pc_amount_history h;

  for e in
    select (x ->> 'squad_member_id')::uuid as member,
           (x ->> 'amount')::bigint as new_amount,
           (x ->> 'expected')::bigint as expected
    from jsonb_array_elements(p_entries) x
    order by 1
  loop
    if e.member is null or e.new_amount is null then
      raise exception 'member and amount are required' using errcode = '22004';
    end if;
    if e.new_amount < 0 or e.new_amount > 100000000 then
      raise exception 'amount must be between 0 and 100000000' using errcode = '23514';
    end if;
    if e.expected is not null and e.expected < 0 then
      raise exception 'expected amount must not be negative' using errcode = '22023';
    end if;

    perform 1 from public.squad_members sm where sm.id = e.member for update;
    if not found then
      raise exception 'unknown squad member' using errcode = '42704';
    end if;

    select a.amount into v_current
    from public.member_pc_amounts a
    where a.challenge_id = c.id and a.squad_member_id = e.member;

    if v_current is not distinct from e.new_amount then
      return query select e.member, 'unchanged'::text, e.new_amount;
    elsif v_current is distinct from e.expected then
      return query select e.member, 'conflict'::text, v_current;
    else
      insert into public.member_pc_amounts as a (challenge_id, squad_member_id, amount)
      values (c.id, e.member, e.new_amount)
      on conflict on constraint member_pc_amounts_pkey do update set amount = excluded.amount;
      return query select e.member, 'saved'::text, e.new_amount;
    end if;
  end loop;

  -- Same transaction: a save that fails or rolls back queues nothing.
  perform private.pc_enqueue(c, v_after, p_now);
end;
$$;

create or replace function public.submit_pc_amounts(p_challenge_id uuid, p_entries jsonb)
returns table (squad_member_id uuid, status text, amount bigint)
language sql volatile security definer set search_path = ''
as $$
  select * from private.submit_pc_amounts_at(p_challenge_id, p_entries, now());
$$;

-- -----------------------------------------------------------------------------
-- Outbox rules for the new kinds (existing kinds unchanged)
-- -----------------------------------------------------------------------------
create or replace function private.notify_cancel_reason(j private.notification_jobs, p_now timestamptz)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  pol private.notify_policy;
  cm record;
begin
  select * into pol from private.notify_policy where id;
  -- PC$: measured from when it could first be sent (quiet hours don't age it).
  if j.kind in ('pc_activity', 'pc_milestone') then
    if j.scheduled_for < p_now - (case when j.kind = 'pc_activity' then pol.stale_activity else pol.stale_other end) then
      return 'stale';
    end if;
    return null;
  end if;
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

create or replace function private.notify_device_wants(j private.notification_jobs, s public.push_subscriptions)
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
    -- PC$: squad activity; a milestone save also reaches phones that only want milestones.
    when 'pc_activity' then s.pref_activity
    when 'pc_milestone' then s.pref_activity or s.pref_milestones
    else false
  end;
$$;

revoke all on function private.pc_enqueue(public.pc_challenges, bigint, timestamptz) from public, anon, authenticated;
revoke all on function private.submit_pc_amounts_at(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.submit_pc_amounts(uuid, jsonb) from public;
grant execute on function public.submit_pc_amounts(uuid, jsonb) to anon, authenticated, service_role;
revoke all on function private.notify_cancel_reason(private.notification_jobs, timestamptz) from public;
revoke all on function private.notify_device_wants(private.notification_jobs, public.push_subscriptions) from public;
