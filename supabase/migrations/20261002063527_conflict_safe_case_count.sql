-- =============================================================================
-- Conflict-safe case-count saves.
--
-- submit_case_count now takes the count the member last saw (p_expected_count)
-- and returns a status:
--   saved      the new current total was stored
--   unchanged  the stored total already equals the submitted value (a repeated
--              or double-tapped submit never changes anything)
--   conflict   the stored total changed since the member loaded the page
--              (another device / an admin); nothing is written and the current
--              value is returned so the member can decide
-- Saves for one member are serialised with a row lock.
-- =============================================================================

drop function public.submit_case_count(text, integer);

create function public.submit_case_count(
  p_token text,
  p_case_count integer,
  p_expected_count integer default null
)
returns table (status text, month date, case_count integer, previous_count integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_squad_member uuid := private.member_for_token(p_token);
  v_member uuid;
  v_campaign uuid;
  v_month date;
  v_current integer;
begin
  if v_squad_member is null then
    raise exception 'invalid or revoked update link' using errcode = '28000';
  end if;
  if p_case_count is null then
    raise exception 'case count is required' using errcode = '22004';
  end if;
  if p_case_count < 0 or p_case_count > 1000 then
    raise exception 'case count must be between 0 and 1000' using errcode = '23514';
  end if;
  if p_expected_count is not null and p_expected_count < 0 then
    raise exception 'expected count must not be negative' using errcode = '22023';
  end if;

  select cm.campaign_id, cm.month into v_campaign, v_month
  from private.current_campaign_month() cm;
  if v_month is null then
    raise exception 'no campaign month is open' using errcode = 'P0002';
  end if;

  -- Serialise concurrent saves for this member (double taps, two devices).
  select sm.member_id into v_member
  from public.squad_members sm
  where sm.id = v_squad_member
  for update;

  select mcc.case_count into v_current
  from public.member_case_counts mcc
  where mcc.squad_member_id = v_squad_member
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

  perform set_config('cjo.changed_by', v_member::text, true);

  insert into public.member_case_counts
    (squad_member_id, campaign_id, month, case_count)
  values (v_squad_member, v_campaign, v_month, p_case_count)
  -- Constraint name, not a column list: `month` is also an output column here.
  on conflict on constraint member_case_counts_one_per_month
    do update set case_count = excluded.case_count;

  return query select 'saved'::text, v_month, p_case_count, v_current;
end;
$$;

revoke all on function public.submit_case_count(text, integer, integer) from public;
grant execute on function public.submit_case_count(text, integer, integer)
  to anon, authenticated, service_role;
