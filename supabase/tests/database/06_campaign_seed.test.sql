-- This deployment's campaign seed (supabase/migrations/*_campaign_*.sql).
-- Squad-specific: a new squad replaces this file with its own campaign.
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select results_eq(
  $$select t.month, t.target_cases from public.monthly_targets t
    join public.campaigns c on c.id = t.campaign_id
    where c.slug = 'q4-2026' order by t.month$$,
  $$values (date '2026-10-01', 20), (date '2026-11-01', 30), (date '2026-12-01', 40)$$,
  'Q4 2026 targets are 20 / 30 / 40'
);

select * from finish();
rollback;
