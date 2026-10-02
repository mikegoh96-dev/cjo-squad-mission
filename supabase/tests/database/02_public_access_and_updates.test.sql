-- Public read access and shared-link update tests. Run with: npx supabase test db
--
-- Fixture (rolled back): a campaign covering the CURRENT month (so the test is
-- independent of the date), squad Alpha (Mike, Jeremy), squad Bravo (Sarah).
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

delete from public.campaigns;  -- isolate from real campaigns (rolled back)
insert into public.campaigns (id, slug, name, starts_on, ends_on) values (
  'dddddddd-0000-0000-0000-000000000001', 'test-current', 'Test Campaign',
  date_trunc('month', now() at time zone 'Asia/Singapore')::date,
  (date_trunc('month', now() at time zone 'Asia/Singapore') + interval '1 month - 1 day')::date
);
insert into public.monthly_targets (campaign_id, month, target_cases) values (
  'dddddddd-0000-0000-0000-000000000001',
  date_trunc('month', now() at time zone 'Asia/Singapore')::date, 20
);

insert into public.members (id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Mike'),
  ('00000000-0000-0000-0000-00000000000b', 'Jeremy'),
  ('00000000-0000-0000-0000-00000000000c', 'Sarah');
insert into public.squads (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Alpha'),
  ('10000000-0000-0000-0000-00000000000b', 'Bravo');
insert into public.squad_members (id, squad_id, member_id) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
-- Jeremy 4, Sarah 3 this month (admin-entered).
insert into public.member_case_counts (squad_member_id, campaign_id, month, case_count)
select v.id, 'dddddddd-0000-0000-0000-000000000001', date_trunc('month', now() at time zone 'Asia/Singapore')::date, v.n
from (values ('20000000-0000-0000-0000-00000000000b'::uuid, 4), ('20000000-0000-0000-0000-00000000000c'::uuid, 3)) v(id, n);
-- One Alpha change from "last month" (before this week) for momentum windows.
insert into public.case_update_history (squad_member_id, campaign_id, month, old_count, new_count, changed_at)
values ('20000000-0000-0000-0000-00000000000b', 'dddddddd-0000-0000-0000-000000000001',
        date_trunc('month', now() at time zone 'Asia/Singapore')::date, 0, 2, now() - interval '8 days');

create temporary view counts_now as
  select squad_member_id, case_count from public.member_case_counts
  where month = date_trunc('month', now() at time zone 'Asia/Singapore')::date;
grant select on counts_now to anon, authenticated;

-- =============================================================================
-- As an anonymous visitor (anyone with the shared link)
-- =============================================================================
set local role anon;

select results_eq($$select name from public.squads order by name$$, $$values ('Alpha'), ('Bravo')$$,
  'anon can read squads');
select results_eq($$select display_name from public.members order by display_name$$,
  $$values ('Jeremy'), ('Mike'), ('Sarah')$$, 'anon can read member names (for the name picker)');
select is((select count(*)::int from public.squad_members), 3, 'anon can read squad membership');
select is((select count(*)::int from public.monthly_targets), 1, 'anon can read campaign targets');
select results_eq(
  $$select squad_name, total_cases, target_cases from public.squad_monthly_progress order by squad_name$$,
  $$values ('Alpha', 4, 20), ('Bravo', 3, 20)$$,
  'anon can read derived squad progress');

-- Direct writes are impossible: the controlled function is the only write path
select throws_ok($$update public.member_case_counts set case_count = 99$$, '42501', null,
  'anon cannot update case counts directly');
select throws_ok(
  $$insert into public.member_case_counts (squad_member_id, campaign_id, month, case_count)
    values ('20000000-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-000000000001',
            date_trunc('month', now())::date, 99)$$,
  '42501', null, 'anon cannot insert case counts directly');
select throws_ok($$delete from public.member_case_counts$$, '42501', null,
  'anon cannot delete case counts');
select throws_ok($$update public.members set display_name = 'Hacked'$$, '42501', null,
  'anon cannot rename members');
select throws_ok($$insert into public.members (display_name) values ('Fake')$$, '42501', null,
  'anon cannot add members');
select throws_ok($$delete from public.squad_members$$, '42501', null,
  'anon cannot remove members from a squad');
select throws_ok($$update public.monthly_targets set target_cases = 1$$, '42501', null,
  'anon cannot change targets');
select throws_ok($$insert into public.squads (name) values ('Fake')$$, '42501', null,
  'anon cannot create squads');
select throws_ok($$select * from public.case_update_history$$, '42501', null,
  'anon cannot read the raw audit history');
select throws_ok($$delete from public.case_update_history$$, '42501', null,
  'anon cannot erase the audit history');

-- Submitting sets the chosen member's CURRENT total (not an increment)
select results_eq(
  $$select status, case_count, previous_count
    from public.submit_case_count('20000000-0000-0000-0000-00000000000a', 6, 0)$$,
  $$values ('saved'::text, 6, 0)$$, 'Mike''s count is set to 6');
select results_eq(
  $$select status, case_count from public.submit_case_count('20000000-0000-0000-0000-00000000000a', 6, 0)$$,
  $$values ('unchanged'::text, 6)$$, 'a double-tapped submit of 6 reports unchanged (no double counting)');
select results_eq(
  $$select status, case_count from public.submit_case_count('20000000-0000-0000-0000-00000000000a', 7)$$,
  $$values ('saved'::text, 7)$$, 'Mike''s total is updated to 7');
select results_eq(
  $$select squad_member_id, case_count from counts_now order by squad_member_id$$,
  $$values ('20000000-0000-0000-0000-00000000000a'::uuid, 7),
           ('20000000-0000-0000-0000-00000000000b'::uuid, 4),
           ('20000000-0000-0000-0000-00000000000c'::uuid, 3)$$,
  'only the chosen member''s count changed');
select results_eq(
  $$select total_cases from public.squad_monthly_progress where squad_name = 'Alpha'$$,
  $$values (11)$$, 'Alpha total recalculates (7 + 4)');

-- Conflict-safe saves
select results_eq(
  $$select status, case_count from public.submit_case_count('20000000-0000-0000-0000-00000000000a', 9, 5)$$,
  $$values ('conflict'::text, 7)$$,
  'a stale expected count reports conflict with the current value');
select results_eq($$select case_count from counts_now where squad_member_id = '20000000-0000-0000-0000-00000000000a'$$,
  $$values (7)$$, 'a conflict writes nothing');
select results_eq(
  $$select status, case_count from public.submit_case_count('20000000-0000-0000-0000-00000000000a', 7, 5)$$,
  $$values ('unchanged'::text, 7)$$,
  'a duplicate submit from a stale page that already applied reports unchanged, not conflict');
select results_eq(
  $$select status, case_count, previous_count
    from public.submit_case_count('20000000-0000-0000-0000-00000000000a', 8, 7)$$,
  $$values ('saved'::text, 8, 7)$$, 'a matching expected count saves');
select results_eq(
  $$select status, case_count from public.submit_case_count('20000000-0000-0000-0000-00000000000a', 7, 8)$$,
  $$values ('saved'::text, 7)$$, 'totals can be lowered (corrections)');
select results_eq(
  $$select status, case_count from public.submit_case_count('20000000-0000-0000-0000-00000000000c', 0, 3)$$,
  $$values ('saved'::text, 0)$$, 'zero is a valid total');
select results_eq(
  $$select status, case_count from public.submit_case_count('20000000-0000-0000-0000-00000000000c', 1000, 0)$$,
  $$values ('saved'::text, 1000)$$, 'the maximum (1000) is accepted');
select results_eq(
  $$select status from public.submit_case_count('20000000-0000-0000-0000-00000000000c', 3, 1000)$$,
  $$values ('saved'::text)$$, 'and can be corrected back');

-- Rejected submissions
select throws_ok($$select public.submit_case_count('20000000-0000-0000-0000-0000000000ff', 5)$$, '42704', null,
  'an unknown member cannot be updated');
select throws_ok($$select public.submit_case_count('00000000-0000-0000-0000-00000000000a', 5)$$, '42704', null,
  'a member id (not a squad membership id) is rejected');
select throws_ok($$select public.submit_case_count(null, 5)$$, '42704', null, 'a missing member is rejected');
select throws_ok($$select public.submit_case_count('20000000-0000-0000-0000-00000000000a', -1)$$, '23514', null,
  'negative counts are rejected');
select throws_ok($$select public.submit_case_count('20000000-0000-0000-0000-00000000000a', 1001)$$, '23514', null,
  'counts above the maximum are rejected');
select throws_ok($$select public.submit_case_count('20000000-0000-0000-0000-00000000000a', '6.5')$$, '22P02', null,
  'decimal counts are rejected');
select throws_ok($$select public.submit_case_count('20000000-0000-0000-0000-00000000000a', 'seven')$$, '22P02', null,
  'non-numeric counts are rejected');
select throws_ok($$select public.submit_case_count('20000000-0000-0000-0000-00000000000a', null)$$, '22004', null,
  'missing counts are rejected');
select throws_ok($$select public.submit_case_count('20000000-0000-0000-0000-00000000000a', 5, -1)$$, '22023', null,
  'a negative expected count is rejected');
select throws_ok($$select public.submit_case_count('not-a-uuid', 5)$$, '22P02', null,
  'a malformed member id is rejected');

-- Momentum: net cases today / this week, per squad
select results_eq(
  $$select today, this_week from public.squad_momentum('10000000-0000-0000-0000-00000000000a')$$,
  $$values (11, 11)$$,
  'Alpha momentum: +11 today and this week (Jeremy +4, Mike +7; the 8-day-old +2 is excluded)');
select results_eq(
  $$select today, this_week from public.squad_momentum('10000000-0000-0000-0000-00000000000b')$$,
  $$values (3, 3)$$,
  'Bravo momentum is the net change: +3, then 3 -> 0 -> 1000 -> 3 nets to 0');
select ok(
  (select last_change_at is not null from public.squad_momentum('10000000-0000-0000-0000-00000000000a')),
  'momentum reports when the squad last changed');
select results_eq(
  $$select today, this_week from public.squad_momentum('10000000-0000-0000-0000-0000000000ff')$$,
  $$values (0, 0)$$, 'an unknown squad has no momentum (not an error)');

-- Per-member momentum: each member's net contribution (aggregates only)
select results_eq(
  $$select squad_member_id, today, this_week
    from public.squad_member_momentum('10000000-0000-0000-0000-00000000000a') order by squad_member_id$$,
  $$values ('20000000-0000-0000-0000-00000000000a'::uuid, 7, 7),
           ('20000000-0000-0000-0000-00000000000b'::uuid, 4, 4)$$,
  'Alpha per member: Mike +7, Jeremy +4 (his 8-day-old +2 is excluded)');
select is(
  (select sum(this_week)::int from public.squad_member_momentum('10000000-0000-0000-0000-00000000000a')),
  (select this_week from public.squad_momentum('10000000-0000-0000-0000-00000000000a')),
  'per-member contributions add up to the squad momentum');
select results_eq(
  $$select today, this_week from public.squad_member_momentum('10000000-0000-0000-0000-00000000000b')$$,
  $$values (3, 3)$$, 'Bravo per member: Sarah nets +3');
select is_empty(
  $$select * from public.squad_member_momentum('10000000-0000-0000-0000-0000000000ff')$$,
  'an unknown squad has no members');

-- Recent updates for corrections
select results_eq(
  $$select old_count, new_count from public.member_recent_updates('20000000-0000-0000-0000-00000000000a', 3)$$,
  $$values (8, 7), (7, 8), (6, 7)$$,
  'recent updates are newest first and limited');
select is(
  (select count(*)::int from public.member_recent_updates('20000000-0000-0000-0000-00000000000a', 500)),
  4, 'the limit is capped and returns all 4 real changes (repeats are not logged)');
select is_empty(
  $$select * from public.member_recent_updates('20000000-0000-0000-0000-0000000000ff')$$,
  'an unknown member has no updates');

-- =============================================================================
-- Audit (as the table owner)
-- =============================================================================
reset role;
select results_eq(
  $$select old_count, new_count, changed_by from public.case_update_history
    where squad_member_id = '20000000-0000-0000-0000-00000000000a' order by id$$,
  $$values (0, 6, null::uuid), (6, 7, null::uuid), (7, 8, null::uuid), (8, 7, null::uuid)$$,
  'history keeps every real change; the submitter is unknown (shared link)');

-- A member with no changes still appears, at 0
insert into public.members (id, display_name) values ('00000000-0000-0000-0000-00000000000d', 'Zed');
insert into public.squad_members (id, squad_id, member_id)
  values ('20000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d');
set local role anon;
select results_eq(
  $$select today, this_week from public.squad_member_momentum('10000000-0000-0000-0000-00000000000b')
    where squad_member_id = '20000000-0000-0000-0000-00000000000d'$$,
  $$values (0, 0)$$, 'a member with no changes this week shows 0');
reset role;

select * from finish();
rollback;
