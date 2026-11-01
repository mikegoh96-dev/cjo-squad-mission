-- This deployment's campaign and PC$ challenge seeds (supabase/migrations).
-- Squad-specific: a new squad replaces this file with its own campaign.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select results_eq(
  $$select t.month, t.target_cases from public.monthly_targets t
    join public.campaigns c on c.id = t.campaign_id
    where c.slug = 'q4-2026' order by t.month$$,
  $$values (date '2026-10-01', 20), (date '2026-11-01', 30), (date '2026-12-01', 40)$$,
  'Q4 2026 targets are 20 / 30 / 40'
);
select results_eq(
  $$select pc.eligible_from, pc.eligible_to, pc.target_amount, pc.member_minimum, pc.opens_at, pc.closes_at
    from public.pc_challenges pc join public.campaigns c on c.id = pc.campaign_id
    where pc.slug = 'pc-nov-2026' and c.slug = 'q4-2026'$$,
  $$values (date '2026-11-01', date '2026-11-30', 182972::bigint, 5000::bigint,
            timestamptz '2026-11-01 00:00+08', timestamptz '2026-12-01 00:00+08')$$,
  'November PC$: target 182,972 (growth included), minimum 5,000, entries 1-30 Nov Singapore time'
);

select * from finish();
rollback;
