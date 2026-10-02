-- Campaign configuration (real configuration data, not test data).
-- Squad targets: October 20, November 30, December 40 cases.
-- To change a target later, update public.monthly_targets (as an admin or in
-- a new migration); never hard-code targets in application code.

with campaign as (
  insert into public.campaigns (slug, name, starts_on, ends_on)
  values ('q4-2026', 'CJO Squad Mission Q4 2026', '2026-10-01', '2026-12-31')
  returning id
)
insert into public.monthly_targets (campaign_id, month, target_cases)
select campaign.id, target.month, target.target_cases
from campaign
cross join (
  values
    (date '2026-10-01', 20),
    (date '2026-11-01', 30),
    (date '2026-12-01', 40)
) as target (month, target_cases);
