-- =============================================================================
-- Shared-link updates (replaces private per-member update links).
--
-- Product decision: anyone with the squad's shared link can pick a member's
-- name and set that member's current total for the open campaign month. There
-- is no credential, so the database CANNOT prove who submitted a change. This
-- is accepted for a trusted internal team tool; mitigations:
--   * writes only through submit_case_count (no direct table writes),
--   * only existing squad members, only the open month, only 0-1000,
--   * conflict-safe (a stale page cannot silently overwrite a newer count),
--   * every change is kept in the append-only case_update_history, so a
--     mistake or misuse can be seen and corrected by an admin.
--
-- Also adds two read-only functions for the dashboard:
--   squad_momentum(squad)          net cases added today / this week
--   member_recent_updates(member)  a member's last few changes (for corrections)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Remove the token infrastructure (no tokens were in use)
-- -----------------------------------------------------------------------------
drop function public.submit_case_count(text, integer, integer);
drop function public.get_update_context(text);
drop function public.admin_issue_update_token(uuid);
drop function public.admin_revoke_update_token(uuid);
drop function public.admin_update_link_status();
drop function private.member_for_token(text);
drop function private.token_hash(text);
drop table public.member_update_tokens;

comment on column public.case_update_history.changed_by is
  'Not set by shared-link updates (the submitter cannot be identified). Null = unknown or admin.';

-- -----------------------------------------------------------------------------
-- 2. Set a member's current total for the open month
-- -----------------------------------------------------------------------------
-- Returns a status:
--   saved      the new current total was stored
--   unchanged  the stored total already equals the submitted value (repeated or
--              double-tapped submits never change anything)
--   conflict   the stored total changed since the page was loaded
--              (p_expected_count differs); nothing is written
-- Saves for one member are serialised with a row lock.
create function public.submit_case_count(
  p_squad_member_id uuid,
  p_case_count integer,
  p_expected_count integer default null
)
returns table (status text, month date, case_count integer, previous_count integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_found uuid;
  v_campaign uuid;
  v_month date;
  v_current integer;
begin
  if p_case_count is null then
    raise exception 'case count is required' using errcode = '22004';
  end if;
  if p_case_count < 0 or p_case_count > 1000 then
    raise exception 'case count must be between 0 and 1000' using errcode = '23514';
  end if;
  if p_expected_count is not null and p_expected_count < 0 then
    raise exception 'expected count must not be negative' using errcode = '22023';
  end if;

  -- Lock the member row: serialises concurrent saves (double taps, two phones).
  select sm.id into v_found
  from public.squad_members sm
  where sm.id = p_squad_member_id
  for update;
  if v_found is null then
    raise exception 'unknown squad member' using errcode = '42704';
  end if;

  select cm.campaign_id, cm.month into v_campaign, v_month
  from private.current_campaign_month() cm;
  if v_month is null then
    raise exception 'no campaign month is open' using errcode = 'P0002';
  end if;

  select mcc.case_count into v_current
  from public.member_case_counts mcc
  where mcc.squad_member_id = v_found
    and mcc.campaign_id = v_campaign
    and mcc.month = v_month;
  v_current := coalesce(v_current, 0);

  if p_case_count = v_current then
    return query select 'unchanged'::text, v_month, v_current, v_current;
    return;
  end if;

  if p_expected_count is not null and p_expected_count <> v_current then
    return query select 'conflict'::text, v_month, v_current, v_current;
    return;
  end if;

  insert into public.member_case_counts
    (squad_member_id, campaign_id, month, case_count)
  values (v_found, v_campaign, v_month, p_case_count)
  -- Constraint name, not a column list: `month` is also an output column here.
  on conflict on constraint member_case_counts_one_per_month
    do update set case_count = excluded.case_count;

  return query select 'saved'::text, v_month, p_case_count, v_current;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Read-only dashboard helpers (aggregates only; history stays private)
-- -----------------------------------------------------------------------------

-- Net cases added to a squad today and this week (Monday start), in the
-- current campaign's time zone. Net = sum of (new - old), so corrections count.
create function public.squad_momentum(p_squad_id uuid)
returns table (today integer, this_week integer, last_change_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz text;
  v_local timestamp;
begin
  select c.time_zone into v_tz
  from public.campaigns c
  order by (current_date between c.starts_on and c.ends_on) desc, c.starts_on desc
  limit 1;
  v_tz := coalesce(v_tz, 'UTC');
  v_local := now() at time zone v_tz;

  return query
  select
    coalesce(sum(h.new_count - h.old_count)
      filter (where h.changed_at >= date_trunc('day', v_local) at time zone v_tz), 0)::integer,
    coalesce(sum(h.new_count - h.old_count)
      filter (where h.changed_at >= date_trunc('week', v_local) at time zone v_tz), 0)::integer,
    max(h.changed_at)
  from public.case_update_history h
  join public.squad_members sm on sm.id = h.squad_member_id
  where sm.squad_id = p_squad_id;
end;
$$;

-- A member's most recent changes (newest first, at most 20), so anyone fixing a
-- mistake can see what was entered.
create function public.member_recent_updates(p_squad_member_id uuid, p_limit integer default 5)
returns table (month date, old_count integer, new_count integer, changed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select h.month, h.old_count, h.new_count, h.changed_at
  from public.case_update_history h
  where h.squad_member_id = p_squad_member_id
  order by h.changed_at desc, h.id desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

-- -----------------------------------------------------------------------------
-- 4. Grants
-- -----------------------------------------------------------------------------
revoke all on function public.submit_case_count(uuid, integer, integer) from public;
revoke all on function public.squad_momentum(uuid) from public;
revoke all on function public.member_recent_updates(uuid, integer) from public;
grant execute on function public.submit_case_count(uuid, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.squad_momentum(uuid) to anon, authenticated, service_role;
grant execute on function public.member_recent_updates(uuid, integer) to anon, authenticated, service_role;
