-- This squad's November 2026 PC$ challenge (configuration data, not test data).
-- Official squad target $182,972 (already includes the 20% growth: never apply
-- it again), individual minimum $5,000, eligible production 1-30 November 2026.
-- Entries open 1 Nov 00:00 and close 30 Nov 23:59:59 Singapore time.

insert into public.pc_challenges
  (campaign_id, slug, name, eligible_from, eligible_to, target_amount, member_minimum, opens_at, closes_at)
select c.id, 'pc-nov-2026', 'November PC$ challenge', date '2026-11-01', date '2026-11-30',
       182972, 5000, timestamptz '2026-11-01 00:00:00+08', timestamptz '2026-12-01 00:00:00+08'
from public.campaigns c
where c.slug = 'q4-2026'
on conflict (slug) do nothing;
