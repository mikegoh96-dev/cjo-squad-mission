-- =============================================================================
-- Squad Recap (Mission page): the squad's recorded case-count changes for one
-- campaign, so the app can work out what happened in any week or month.
--
-- Additive and read-only: one new function, no table, policy or data change.
-- It returns the same kind of data member_recent_updates already returns
-- (month, net change, time, squad member; counts only, never who tapped), for
-- the whole squad instead of one member's last 20. The raw table stays private.
--
-- Rows: every committed change (zero-change rows skipped) of the squad's
-- current members for that campaign, strictly before p_until (capped at now),
-- oldest first, at most 5000 (the app treats a full page as "incomplete").
--
-- Recovery: drop function public.squad_recap_history(uuid, uuid, timestamptz);
-- the Recap card then reports "Recap isn't available yet" and nothing else is
-- affected.
-- =============================================================================

create function public.squad_recap_history(p_squad_id uuid, p_campaign_id uuid, p_until timestamptz)
returns table (changed_at timestamptz, month date, delta integer, squad_member_id uuid)
language sql stable security definer set search_path = ''
as $$
  select h.changed_at, h.month, (h.new_count - h.old_count)::integer, h.squad_member_id
  from public.case_update_history h
  join public.squad_members sm on sm.id = h.squad_member_id
  where sm.squad_id = p_squad_id
    and h.campaign_id = p_campaign_id
    and h.new_count <> h.old_count
    and h.changed_at < least(coalesce(p_until, now()), now())
  order by h.changed_at, h.id
  limit 5000;
$$;

revoke all on function public.squad_recap_history(uuid, uuid, timestamptz) from public;
grant execute on function public.squad_recap_history(uuid, uuid, timestamptz)
  to anon, authenticated, service_role;
