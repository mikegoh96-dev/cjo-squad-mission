-- =============================================================================
-- Each member's contribution to the squad's momentum: net cases added today and
-- this week (Monday start), in the current campaign's time zone. Same rules as
-- squad_momentum (net = sum of new - old, so corrections count). Aggregates
-- only; the raw history stays private. Every squad member is returned (0 when
-- they have no changes), listed by squad membership, never ranked.
-- =============================================================================

create function public.squad_member_momentum(p_squad_id uuid)
returns table (squad_member_id uuid, today integer, this_week integer)
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
    sm.id,
    coalesce(sum(h.new_count - h.old_count)
      filter (where h.changed_at >= date_trunc('day', v_local) at time zone v_tz), 0)::integer,
    coalesce(sum(h.new_count - h.old_count)
      filter (where h.changed_at >= date_trunc('week', v_local) at time zone v_tz), 0)::integer
  from public.squad_members sm
  left join public.case_update_history h on h.squad_member_id = sm.id
  where sm.squad_id = p_squad_id
  group by sm.id;
end;
$$;

revoke all on function public.squad_member_momentum(uuid) from public;
grant execute on function public.squad_member_momentum(uuid) to anon, authenticated, service_role;
