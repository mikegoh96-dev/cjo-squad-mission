-- =============================================================================
-- CJO Squad Mission: public dashboard + private per-member update links
--
-- Replaces Supabase Auth based access:
--   * Squad progress data is PUBLIC and READ-ONLY (anon SELECT).
--   * The ONLY case-count write path is public.submit_case_count(token, count):
--     the server hashes the raw link token, finds the member it belongs to and
--     updates that member's count for the current campaign month. No member id
--     is ever accepted from the client.
--   * Raw tokens are never stored: member_update_tokens holds SHA-256 hashes.
--   * Links are issued/regenerated/revoked only by admins (service role or the
--     SQL editor) via public.admin_issue_update_token / admin_revoke_update_token.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Remove Supabase Auth based access
-- -----------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.handle_new_user();
drop function if exists public.set_my_case_count(uuid, date, integer);

drop policy "Members read own and squadmates' profiles" on public.profiles;
drop policy "Members update own profile" on public.profiles;
drop policy "Members read own squad" on public.squads;
drop policy "Admins insert squads" on public.squads;
drop policy "Admins update squads" on public.squads;
drop policy "Admins delete squads" on public.squads;
drop policy "Members read own squad's members" on public.squad_members;
drop policy "Admins insert squad members" on public.squad_members;
drop policy "Admins update squad members" on public.squad_members;
drop policy "Admins delete squad members" on public.squad_members;
drop policy "Signed-in users read campaigns" on public.campaigns;
drop policy "Admins insert campaigns" on public.campaigns;
drop policy "Admins update campaigns" on public.campaigns;
drop policy "Admins delete campaigns" on public.campaigns;
drop policy "Signed-in users read monthly targets" on public.monthly_targets;
drop policy "Admins insert monthly targets" on public.monthly_targets;
drop policy "Admins update monthly targets" on public.monthly_targets;
drop policy "Admins delete monthly targets" on public.monthly_targets;
drop policy "Members read own squad's case counts" on public.member_case_counts;
drop policy "Members insert own case count" on public.member_case_counts;
drop policy "Members update own case count" on public.member_case_counts;
drop policy "Admins delete case counts" on public.member_case_counts;
drop policy "Members read own squad's case history" on public.case_update_history;

drop function private.is_admin();
drop function private.my_squad_ids();
drop function private.my_squad_member_ids();
drop function private.squadmate_member_ids();
drop function private.squadmate_user_ids();

revoke usage on schema private from authenticated;

-- -----------------------------------------------------------------------------
-- 2. Members are plain records (no login accounts)
-- -----------------------------------------------------------------------------

alter table public.profiles rename to members;
alter table public.members drop constraint profiles_id_fkey;
alter table public.members alter column id set default gen_random_uuid();
alter table public.members drop column is_admin;
alter table public.members rename constraint profiles_pkey to members_pkey;
alter table public.members rename constraint profiles_display_name_check to members_display_name_check;
alter trigger profiles_set_updated_at on public.members rename to members_set_updated_at;
comment on table public.members is
  'Squad members. Display name only; members have no login accounts.';

alter table public.squad_members rename column user_id to member_id;
alter table public.squad_members rename constraint squad_members_user_id_key to squad_members_member_id_key;
alter table public.squad_members rename constraint squad_members_user_id_fkey to squad_members_member_id_fkey;

-- Campaign months are resolved in the campaign's own time zone (data, not code).
alter table public.campaigns
  add column time_zone text not null default 'Asia/Singapore';

-- -----------------------------------------------------------------------------
-- 3. Update link tokens (hashes only)
-- -----------------------------------------------------------------------------

create table public.member_update_tokens (
  -- One active link per member: regenerating replaces the hash.
  squad_member_id uuid primary key
    references public.squad_members (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now()
);
comment on table public.member_update_tokens is
  'SHA-256 hashes of private update-link tokens. Raw tokens are never stored. Not exposed to any API role.';

alter table public.member_update_tokens enable row level security;
revoke all on table public.member_update_tokens from anon, authenticated, service_role;
-- No policies and no grants: only the security definer functions below use it.

-- -----------------------------------------------------------------------------
-- 4. Private helpers
-- -----------------------------------------------------------------------------

create function private.token_hash(p_token text)
returns bytea
language sql immutable set search_path = ''
as $$
  select sha256(convert_to(p_token, 'UTF8'));
$$;

-- Squad member id for a well-formed, active token; null otherwise.
create function private.member_for_token(p_token text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select t.squad_member_id
  from public.member_update_tokens t
  where p_token ~ '^[0-9a-f]{64}$'
    and t.token_hash = private.token_hash(p_token);
$$;

-- The campaign month that is open right now (in the campaign's time zone).
create function private.current_campaign_month(out campaign_id uuid, out month date)
language sql stable security definer set search_path = ''
as $$
  select c.id, t.month
  from public.campaigns c
  join public.monthly_targets t on t.campaign_id = c.id
  where t.month = date_trunc('month', now() at time zone c.time_zone)::date
  order by c.starts_on desc
  limit 1;
$$;

-- History now records the member who submitted via their link (null = admin).
create or replace function private.record_case_count_change()
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
    nullif(current_setting('cjo.changed_by', true), '')::uuid
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Token-gated API functions (callable by anyone holding a valid link)
-- -----------------------------------------------------------------------------

-- What the update page shows. Returns no row for invalid/revoked tokens.
create function public.get_update_context(p_token text)
returns table (
  member_name text,
  squad_name text,
  campaign_name text,
  month date,
  case_count integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_squad_member uuid := private.member_for_token(p_token);
  v_campaign uuid;
  v_month date;
begin
  if v_squad_member is null then
    return;
  end if;

  select cm.campaign_id, cm.month into v_campaign, v_month
  from private.current_campaign_month() cm;

  return query
  select m.display_name, s.name, c.name, v_month, coalesce(mcc.case_count, 0)
  from public.squad_members sm
  join public.members m on m.id = sm.member_id
  join public.squads s on s.id = sm.squad_id
  left join public.campaigns c on c.id = v_campaign
  left join public.member_case_counts mcc
    on mcc.squad_member_id = sm.id
    and mcc.campaign_id = v_campaign
    and mcc.month = v_month
  where sm.id = v_squad_member;
end;
$$;

-- Sets the link owner's CURRENT total for the open campaign month.
-- Idempotent: submitting the same value twice leaves the same total.
create function public.submit_case_count(p_token text, p_case_count integer)
returns table (month date, case_count integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_squad_member uuid := private.member_for_token(p_token);
  v_member uuid;
  v_campaign uuid;
  v_month date;
begin
  if v_squad_member is null then
    raise exception 'invalid or revoked update link' using errcode = '28000';
  end if;
  if p_case_count is null then
    raise exception 'case count is required' using errcode = '22004';
  end if;

  select cm.campaign_id, cm.month into v_campaign, v_month
  from private.current_campaign_month() cm;
  if v_month is null then
    raise exception 'no campaign month is open' using errcode = 'P0002';
  end if;

  select sm.member_id into v_member
  from public.squad_members sm where sm.id = v_squad_member;
  perform set_config('cjo.changed_by', v_member::text, true);

  insert into public.member_case_counts
    (squad_member_id, campaign_id, month, case_count)
  values (v_squad_member, v_campaign, v_month, p_case_count)
  -- Constraint name, not a column list: `month` is also an output column here.
  on conflict on constraint member_case_counts_one_per_month
    do update set case_count = excluded.case_count;

  return query select v_month, p_case_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Admin link management (service role / SQL editor only)
-- -----------------------------------------------------------------------------

-- Issues a new link token for a member, replacing (and invalidating) any old
-- one. Returns the raw token ONCE; only its hash is stored.
create function public.admin_issue_update_token(p_squad_member_id uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not exists (select 1 from public.squad_members where id = p_squad_member_id) then
    raise exception 'unknown squad member %', p_squad_member_id using errcode = 'P0002';
  end if;

  insert into public.member_update_tokens (squad_member_id, token_hash)
  values (p_squad_member_id, private.token_hash(v_token))
  on conflict (squad_member_id)
    do update set token_hash = excluded.token_hash, created_at = now();

  return v_token;
end;
$$;

create function public.admin_revoke_update_token(p_squad_member_id uuid)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  delete from public.member_update_tokens where squad_member_id = p_squad_member_id;
  return found;
end;
$$;

-- Which members have an active link (never returns tokens or hashes).
create function public.admin_update_link_status()
returns table (
  squad_member_id uuid,
  member_name text,
  squad_name text,
  link_issued_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select sm.id, m.display_name, s.name, t.created_at
  from public.squad_members sm
  join public.members m on m.id = sm.member_id
  join public.squads s on s.id = sm.squad_id
  left join public.member_update_tokens t on t.squad_member_id = sm.id
  order by s.name, m.display_name;
$$;

-- -----------------------------------------------------------------------------
-- 7. Grants and RLS: public read-only, no direct writes
-- -----------------------------------------------------------------------------

revoke all on table
  public.members, public.squads, public.squad_members, public.campaigns,
  public.monthly_targets, public.member_case_counts, public.case_update_history,
  public.squad_monthly_progress
from anon, authenticated;

grant select on
  public.members, public.squads, public.squad_members, public.campaigns,
  public.monthly_targets, public.member_case_counts, public.squad_monthly_progress
to anon, authenticated;
-- case_update_history and member_update_tokens stay private.

create policy "Public read" on public.members for select to anon, authenticated using (true);
create policy "Public read" on public.squads for select to anon, authenticated using (true);
create policy "Public read" on public.squad_members for select to anon, authenticated using (true);
create policy "Public read" on public.campaigns for select to anon, authenticated using (true);
create policy "Public read" on public.monthly_targets for select to anon, authenticated using (true);
create policy "Public read" on public.member_case_counts for select to anon, authenticated using (true);

revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.get_update_context(text) from public;
revoke all on function public.submit_case_count(text, integer) from public;
grant execute on function public.get_update_context(text) to anon, authenticated, service_role;
grant execute on function public.submit_case_count(text, integer) to anon, authenticated, service_role;

revoke all on function public.admin_issue_update_token(uuid) from public, anon, authenticated;
revoke all on function public.admin_revoke_update_token(uuid) from public, anon, authenticated;
revoke all on function public.admin_update_link_status() from public, anon, authenticated;
grant execute on function public.admin_issue_update_token(uuid) to service_role;
grant execute on function public.admin_revoke_update_token(uuid) to service_role;
grant execute on function public.admin_update_link_status() to service_role;
