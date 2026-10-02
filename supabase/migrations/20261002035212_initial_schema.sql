-- =============================================================================
-- CJO Squad Mission: initial schema
--
-- Collective squad progress. Members report their CURRENT monthly case count;
-- squad totals are always derived (squad_monthly_progress view), never stored.
--
-- Stores case COUNTS only. Never add client names, NRIC, policy numbers,
-- premiums, medical, product or financial-planning data to this database.
--
-- Security model (see CLAUDE.md):
--   * RLS on every table; explicit grants (Supabase's automatic grants revoked).
--   * Members read only their own squad; write only their own case count.
--   * Admins (profiles.is_admin) manage squads, membership and campaigns.
--     is_admin can only be set with the service role / SQL, never via the API.
--   * case_update_history is written by trigger only and is read-only via API.
-- =============================================================================

-- New objects in public stay private until a migration grants access.
-- (ALL, not just DML: Supabase's defaults include TRUNCATE/REFERENCES/TRIGGER.)
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- Helpers live in a schema that is NOT exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 80),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is
  'One row per auth user. Holds display name and admin flag only.';

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
    check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete restrict,
  -- A user belongs to at most one squad.
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index squad_members_squad_id_idx on public.squad_members (squad_id);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  constraint campaigns_dates_valid check (ends_on >= starts_on)
);

-- Squad target per campaign month. Targets are data, never hard-coded.
create table public.monthly_targets (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- First day of the month, e.g. 2026-10-01.
  month date not null check (month = date_trunc('month', month)::date),
  target_cases integer not null check (target_cases > 0),
  primary key (campaign_id, month)
);

-- A member's CURRENT total for one campaign month (not individual cases).
create table public.member_case_counts (
  id uuid primary key default gen_random_uuid(),
  squad_member_id uuid not null
    references public.squad_members (id) on delete cascade,
  campaign_id uuid not null,
  month date not null,
  case_count integer not null default 0
    check (case_count between 0 and 1000),
  updated_at timestamptz not null default now(),
  constraint member_case_counts_one_per_month
    unique (squad_member_id, campaign_id, month),
  -- Counts can only exist for configured campaign months.
  constraint member_case_counts_target_fk foreign key (campaign_id, month)
    references public.monthly_targets (campaign_id, month) on delete cascade
);
create index member_case_counts_campaign_month_idx
  on public.member_case_counts (campaign_id, month);

-- Append-only audit trail of every case-count change. Written by trigger.
create table public.case_update_history (
  id bigint generated always as identity primary key,
  squad_member_id uuid not null
    references public.squad_members (id) on delete cascade,
  campaign_id uuid not null,
  month date not null,
  old_count integer not null check (old_count >= 0),
  new_count integer not null check (new_count >= 0),
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint case_update_history_target_fk foreign key (campaign_id, month)
    references public.monthly_targets (campaign_id, month) on delete cascade
);
create index case_update_history_member_month_idx
  on public.case_update_history (squad_member_id, campaign_id, month, changed_at desc);

-- -----------------------------------------------------------------------------
-- Derived squad progress (single source of truth = member_case_counts)
-- security_invoker makes the view obey the caller's RLS.
-- Deliberately no ranking or ordering between squads or members.
-- -----------------------------------------------------------------------------

create view public.squad_monthly_progress
with (security_invoker = true) as
select
  s.id as squad_id,
  s.name as squad_name,
  t.campaign_id,
  t.month,
  t.target_cases,
  coalesce(sum(c.case_count), 0)::integer as total_cases
from public.squads s
cross join public.monthly_targets t
left join public.squad_members sm on sm.squad_id = s.id
left join public.member_case_counts c
  on c.squad_member_id = sm.id
  and c.campaign_id = t.campaign_id
  and c.month = t.month
group by s.id, s.name, t.campaign_id, t.month, t.target_cases;

-- -----------------------------------------------------------------------------
-- Private helper functions (security definer, pinned search_path)
-- -----------------------------------------------------------------------------

create function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- Squads the current user belongs to.
create function private.my_squad_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select sm.squad_id from public.squad_members sm
  where sm.user_id = (select auth.uid());
$$;

-- The current user's own membership row(s).
create function private.my_squad_member_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select sm.id from public.squad_members sm
  where sm.user_id = (select auth.uid());
$$;

-- Membership rows of everyone in the current user's squad(s).
create function private.squadmate_member_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select sm.id from public.squad_members sm
  where sm.squad_id in (
    select mine.squad_id from public.squad_members mine
    where mine.user_id = (select auth.uid())
  );
$$;

-- User ids of everyone in the current user's squad(s).
create function private.squadmate_user_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select sm.user_id from public.squad_members sm
  where sm.squad_id in (
    select mine.squad_id from public.squad_members mine
    where mine.user_id = (select auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger member_case_counts_set_updated_at
  before update on public.member_case_counts
  for each row execute function private.set_updated_at();

-- Create a profile for every new auth user. is_admin always starts false;
-- user-supplied metadata is only used for the display name.
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Member'
      ),
      80
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill profiles for users created before this migration.
insert into public.profiles (id, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Member'
    ),
    80
  )
from auth.users u
on conflict (id) do nothing;

-- Targets must fall inside their campaign's date range.
create function private.validate_target_month()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  c public.campaigns;
begin
  select * into c from public.campaigns where id = new.campaign_id;
  if new.month < date_trunc('month', c.starts_on)::date
     or new.month > c.ends_on then
    raise exception 'Target month % is outside campaign % (% to %)',
      new.month, c.slug, c.starts_on, c.ends_on
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger monthly_targets_validate_month
  before insert or update on public.monthly_targets
  for each row execute function private.validate_target_month();

-- Record every case-count change in the audit history.
create function private.record_case_count_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.case_count = old.case_count then
    return new;
  end if;

  insert into public.case_update_history
    (squad_member_id, campaign_id, month, old_count, new_count, changed_by)
  values (
    new.squad_member_id,
    new.campaign_id,
    new.month,
    case when tg_op = 'INSERT' then 0 else old.case_count end,
    new.case_count,
    (select auth.uid())
  );
  return new;
end;
$$;

create trigger member_case_counts_record_history
  after insert or update of case_count on public.member_case_counts
  for each row execute function private.record_case_count_change();

-- -----------------------------------------------------------------------------
-- API function: a member sets their own count for a campaign month.
-- security invoker: runs as the caller, so grants and RLS still apply.
-- -----------------------------------------------------------------------------

create function public.set_my_case_count(
  p_campaign_id uuid,
  p_month date,
  p_case_count integer
)
returns public.member_case_counts
language plpgsql security invoker set search_path = ''
as $$
declare
  v_member_id uuid;
  v_row public.member_case_counts;
begin
  if p_case_count is null then
    raise exception 'case count is required' using errcode = '22004';
  end if;

  select sm.id into v_member_id
  from public.squad_members sm
  where sm.user_id = (select auth.uid());

  if v_member_id is null then
    raise exception 'You are not a member of a squad' using errcode = '42501';
  end if;

  insert into public.member_case_counts
    (squad_member_id, campaign_id, month, case_count)
  values (v_member_id, p_campaign_id, p_month, p_case_count)
  on conflict (squad_member_id, campaign_id, month)
    do update set case_count = excluded.case_count
  returning * into v_row;

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants (explicit; anon gets nothing)
-- -----------------------------------------------------------------------------

revoke all on table
  public.profiles, public.squads, public.squad_members, public.campaigns,
  public.monthly_targets, public.member_case_counts, public.case_update_history,
  public.squad_monthly_progress
from anon, authenticated, service_role;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_admin(), private.my_squad_ids(), private.my_squad_member_ids(),
  private.squadmate_member_ids(), private.squadmate_user_ids()
to authenticated;

revoke execute on function public.set_my_case_count(uuid, date, integer)
  from public, anon;
grant execute on function public.set_my_case_count(uuid, date, integer)
  to authenticated, service_role;

-- profiles: members may only change their display name (not is_admin).
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- squads / membership / campaign config: read for members, write gated to
-- admins by RLS.
grant select, insert, update, delete on public.squads to authenticated;
grant select, insert, update, delete on public.squad_members to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.monthly_targets to authenticated;

-- case counts: only case_count can ever be updated through the API.
grant select on public.member_case_counts to authenticated;
grant insert (squad_member_id, campaign_id, month, case_count)
  on public.member_case_counts to authenticated;
grant update (case_count) on public.member_case_counts to authenticated;
grant delete on public.member_case_counts to authenticated;

-- history: read-only through the API.
grant select on public.case_update_history to authenticated;

grant select on public.squad_monthly_progress to authenticated;

-- service_role is the trusted server-side key; it bypasses RLS.
grant select, insert, update, delete on
  public.profiles, public.squads, public.squad_members, public.campaigns,
  public.monthly_targets, public.member_case_counts
to service_role;
grant select, insert on public.case_update_history to service_role;
grant select on public.squad_monthly_progress to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.monthly_targets enable row level security;
alter table public.member_case_counts enable row level security;
alter table public.case_update_history enable row level security;

-- profiles
create policy "Members read own and squadmates' profiles"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.squadmate_user_ids())
    or (select private.is_admin())
  );

create policy "Members update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- squads
create policy "Members read own squad"
  on public.squads for select to authenticated
  using (
    id in (select private.my_squad_ids())
    or (select private.is_admin())
  );

create policy "Admins insert squads"
  on public.squads for insert to authenticated
  with check ((select private.is_admin()));

create policy "Admins update squads"
  on public.squads for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "Admins delete squads"
  on public.squads for delete to authenticated
  using ((select private.is_admin()));

-- squad_members
create policy "Members read own squad's members"
  on public.squad_members for select to authenticated
  using (
    squad_id in (select private.my_squad_ids())
    or (select private.is_admin())
  );

create policy "Admins insert squad members"
  on public.squad_members for insert to authenticated
  with check ((select private.is_admin()));

create policy "Admins update squad members"
  on public.squad_members for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "Admins delete squad members"
  on public.squad_members for delete to authenticated
  using ((select private.is_admin()));

-- campaigns (configuration readable by any signed-in user)
create policy "Signed-in users read campaigns"
  on public.campaigns for select to authenticated
  using (true);

create policy "Admins insert campaigns"
  on public.campaigns for insert to authenticated
  with check ((select private.is_admin()));

create policy "Admins update campaigns"
  on public.campaigns for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "Admins delete campaigns"
  on public.campaigns for delete to authenticated
  using ((select private.is_admin()));

-- monthly_targets (configuration readable by any signed-in user)
create policy "Signed-in users read monthly targets"
  on public.monthly_targets for select to authenticated
  using (true);

create policy "Admins insert monthly targets"
  on public.monthly_targets for insert to authenticated
  with check ((select private.is_admin()));

create policy "Admins update monthly targets"
  on public.monthly_targets for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "Admins delete monthly targets"
  on public.monthly_targets for delete to authenticated
  using ((select private.is_admin()));

-- member_case_counts
create policy "Members read own squad's case counts"
  on public.member_case_counts for select to authenticated
  using (
    squad_member_id in (select private.squadmate_member_ids())
    or (select private.is_admin())
  );

create policy "Members insert own case count"
  on public.member_case_counts for insert to authenticated
  with check (
    squad_member_id in (select private.my_squad_member_ids())
    or (select private.is_admin())
  );

create policy "Members update own case count"
  on public.member_case_counts for update to authenticated
  using (
    squad_member_id in (select private.my_squad_member_ids())
    or (select private.is_admin())
  )
  with check (
    squad_member_id in (select private.my_squad_member_ids())
    or (select private.is_admin())
  );

create policy "Admins delete case counts"
  on public.member_case_counts for delete to authenticated
  using ((select private.is_admin()));

-- case_update_history (no insert/update/delete policies: trigger-only writes)
create policy "Members read own squad's case history"
  on public.case_update_history for select to authenticated
  using (
    squad_member_id in (select private.squadmate_member_ids())
    or (select private.is_admin())
  );
