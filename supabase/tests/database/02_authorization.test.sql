-- Authorization (RLS) behaviour tests. Run with: npx supabase test db
--
-- Fixture:
--   Squad Alpha: user A (Mike), user B (Jeremy)
--   Squad Bravo: user C (Sarah)
--   User D: admin, no squad.  User E: signed up, no squad yet.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"display_name": "Mike"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{"display_name": "Jeremy"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.test', '{"display_name": "Sarah"}'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.test', '{"display_name": "Admin"}'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.test', '{"display_name": "Newbie"}');
update public.profiles set is_admin = true
where id = '00000000-0000-0000-0000-00000000000d';

insert into public.squads (id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Alpha'),
  ('10000000-0000-0000-0000-00000000000b', 'Bravo');

insert into public.squad_members (id, squad_id, user_id) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');

-- B has 4 cases, C has 3 (October).
insert into public.member_case_counts (squad_member_id, campaign_id, month, case_count)
select m.id, c.id, date '2026-10-01', m.n
from (values ('20000000-0000-0000-0000-00000000000b'::uuid, 4),
             ('20000000-0000-0000-0000-00000000000c'::uuid, 3)) as m (id, n)
cross join public.campaigns c where c.slug = 'q4-2026';

-- Campaign id, readable by any signed-in role in the statements below.
create temporary table fixture as
  select id as campaign_id from public.campaigns where slug = 'q4-2026';
grant select on fixture to authenticated, anon;

-- =============================================================================
-- As user A (Mike, squad Alpha)
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select results_eq($$select name from public.squads$$, $$values ('Alpha')$$,
  'A reads only their own squad');
select results_eq(
  $$select user_id from public.squad_members order by user_id$$,
  $$values ('00000000-0000-0000-0000-00000000000a'::uuid), ('00000000-0000-0000-0000-00000000000b'::uuid)$$,
  'A reads only their own squad''s members');
select results_eq(
  $$select display_name from public.profiles order by id$$,
  $$values ('Mike'), ('Jeremy')$$,
  'A reads only their own and squadmates'' profiles');
select is_empty(
  $$select * from public.member_case_counts
    where squad_member_id = '20000000-0000-0000-0000-00000000000c'$$,
  'A cannot read another squad''s case counts');
select is_empty(
  $$select * from public.case_update_history
    where squad_member_id = '20000000-0000-0000-0000-00000000000c'$$,
  'A cannot read another squad''s case history');
select results_eq(
  $$select squad_name, month, total_cases from public.squad_monthly_progress order by month$$,
  $$values ('Alpha', date '2026-10-01', 4), ('Alpha', date '2026-11-01', 0), ('Alpha', date '2026-12-01', 0)$$,
  'A sees only their own squad''s progress');

-- A updates their own count: 6, then 7.
select lives_ok(
  $$select public.set_my_case_count((select campaign_id from fixture), '2026-10-01', 6)$$,
  'A can set their own case count');
select results_eq(
  $$select case_count from public.set_my_case_count((select campaign_id from fixture), '2026-10-01', 7)$$,
  $$values (7)$$,
  'A can update their own case count (stores the current total)');
select results_eq(
  $$select total_cases from public.squad_monthly_progress where month = '2026-10-01'$$,
  $$values (11)$$,
  'squad total is derived from member counts (A 7 + B 4 = 11)');
select results_eq(
  $$select old_count, new_count, changed_by from public.case_update_history
    where squad_member_id = '20000000-0000-0000-0000-00000000000a' order by id$$,
  $$values (0, 6, '00000000-0000-0000-0000-00000000000a'::uuid), (6, 7, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'A''s changes are recorded with old count, new count and changed_by');

-- THE FUNDAMENTAL TEST: can user A modify user B's case count? Must be NO.
select results_eq(
  $$with u as (update public.member_case_counts set case_count = 99
     where squad_member_id = '20000000-0000-0000-0000-00000000000b' returning 1)
    select count(*)::int from u$$,
  $$values (0)$$,
  'A cannot update B''s case count (0 rows affected)');
select throws_ok(
  $$insert into public.member_case_counts (squad_member_id, campaign_id, month, case_count)
    values ('20000000-0000-0000-0000-00000000000b', (select campaign_id from fixture), '2026-11-01', 99)$$,
  '42501', null,
  'A cannot create a case count for B');
select throws_ok(
  $$update public.member_case_counts set squad_member_id = '20000000-0000-0000-0000-00000000000b'
    where squad_member_id = '20000000-0000-0000-0000-00000000000a'$$,
  '42501', null,
  'A cannot reassign their count to B');
select results_eq(
  $$with d as (delete from public.member_case_counts
     where squad_member_id = '20000000-0000-0000-0000-00000000000b' returning 1)
    select count(*)::int from d$$,
  $$values (0)$$,
  'A cannot delete B''s case count');
select results_eq(
  $$with u as (update public.member_case_counts set case_count = 99
     where squad_member_id = '20000000-0000-0000-0000-00000000000c' returning 1)
    select count(*)::int from u$$,
  $$values (0)$$,
  'A cannot update another squad''s case count');

-- Profiles and admin escalation
select throws_ok(
  $$update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null,
  'A cannot grant themselves admin');
select throws_ok(
  $$insert into public.profiles (id, display_name, is_admin)
    values ('00000000-0000-0000-0000-00000000000e', 'Fake', true)$$,
  '42501', null,
  'A cannot insert profiles');
select results_eq(
  $$with u as (update public.profiles set display_name = 'Mike G'
     where id = '00000000-0000-0000-0000-00000000000a' returning 1)
    select count(*)::int from u$$,
  $$values (1)$$,
  'A can change their own display name');
select results_eq(
  $$with u as (update public.profiles set display_name = 'Hacked'
     where id = '00000000-0000-0000-0000-00000000000b' returning 1)
    select count(*)::int from u$$,
  $$values (0)$$,
  'A cannot change B''s display name');

-- Squad membership, squads and campaign configuration
select throws_ok(
  $$insert into public.squad_members (squad_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e')$$,
  '42501', null,
  'A cannot add members to a squad');
select results_eq(
  $$with u as (update public.squad_members set squad_id = '10000000-0000-0000-0000-00000000000b'
     where user_id = '00000000-0000-0000-0000-00000000000a' returning 1)
    select count(*)::int from u$$,
  $$values (0)$$,
  'A cannot move themselves to another squad');
select results_eq(
  $$with d as (delete from public.squad_members
     where user_id = '00000000-0000-0000-0000-00000000000b' returning 1)
    select count(*)::int from d$$,
  $$values (0)$$,
  'A cannot remove B from the squad');
select results_eq(
  $$with u as (update public.squads set name = 'Renamed' returning 1)
    select count(*)::int from u$$,
  $$values (0)$$,
  'A cannot modify squads');
select results_eq(
  $$with u as (update public.monthly_targets set target_cases = 1 returning 1)
    select count(*)::int from u$$,
  $$values (0)$$,
  'A cannot modify campaign targets');
select throws_ok(
  $$insert into public.campaigns (slug, name, starts_on, ends_on)
    values ('fake', 'Fake', '2027-01-01', '2027-01-31')$$,
  '42501', null,
  'A cannot create campaigns');

-- Audit history is append-only
select throws_ok(
  $$insert into public.case_update_history (squad_member_id, campaign_id, month, old_count, new_count)
    values ('20000000-0000-0000-0000-00000000000a', (select campaign_id from fixture), '2026-10-01', 0, 50)$$,
  '42501', null,
  'A cannot write history directly');
select throws_ok(
  $$update public.case_update_history set new_count = 50$$,
  '42501', null,
  'A cannot rewrite history');
select throws_ok(
  $$delete from public.case_update_history$$,
  '42501', null,
  'A cannot delete history');

-- Input validation through the API function
select throws_ok(
  $$select public.set_my_case_count((select campaign_id from fixture), '2026-10-01', -1)$$,
  '23514', null, 'negative counts are rejected');
select throws_ok(
  $$select public.set_my_case_count((select campaign_id from fixture), '2026-10-01', '6.5')$$,
  '22P02', null, 'decimal counts are rejected');
select throws_ok(
  $$select public.set_my_case_count((select campaign_id from fixture), '2026-10-01', 'seven')$$,
  '22P02', null, 'non-numeric counts are rejected');
select throws_ok(
  $$select public.set_my_case_count((select campaign_id from fixture), '2026-10-01', null)$$,
  '22004', null, 'missing counts are rejected');
select throws_ok(
  $$select public.set_my_case_count((select campaign_id from fixture), '2026-09-01', 1)$$,
  '23503', null, 'counts for months outside the campaign are rejected');

reset role;
select results_eq(
  $$select squad_member_id, case_count from public.member_case_counts
    where month = '2026-10-01' order by squad_member_id$$,
  $$values ('20000000-0000-0000-0000-00000000000a'::uuid, 7),
           ('20000000-0000-0000-0000-00000000000b'::uuid, 4),
           ('20000000-0000-0000-0000-00000000000c'::uuid, 3)$$,
  'after all of A''s attempts, only A''s own count changed');

-- =============================================================================
-- As user C (Sarah, squad Bravo): no access to squad Alpha's private data
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}';

select is_empty(
  $$select * from public.member_case_counts
    where squad_member_id in ('20000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b')$$,
  'C cannot read squad Alpha''s case counts');
select is_empty(
  $$select * from public.profiles
    where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')$$,
  'C cannot read squad Alpha''s member profiles');
select is_empty(
  $$select * from public.squad_members where squad_id = '10000000-0000-0000-0000-00000000000a'$$,
  'C cannot read squad Alpha''s membership');
select is_empty(
  $$select * from public.case_update_history
    where squad_member_id in ('20000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000b')$$,
  'C cannot read squad Alpha''s case history');
select results_eq(
  $$select distinct squad_name from public.squad_monthly_progress$$,
  $$values ('Bravo')$$,
  'C sees only squad Bravo''s progress (no cross-squad comparison)');

-- =============================================================================
-- As user E (signed in, not yet in a squad)
-- =============================================================================
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}';

select results_eq($$select count(*)::int from public.monthly_targets$$, $$values (3)$$,
  'any signed-in user can read campaign targets');
select is_empty($$select * from public.squads$$,
  'a user without a squad sees no squads');
select throws_ok(
  $$select public.set_my_case_count((select campaign_id from fixture), '2026-10-01', 1)$$,
  '42501', null,
  'a user without a squad cannot record cases');

-- =============================================================================
-- As anon (not signed in): no access at all
-- =============================================================================
reset role;
set local role anon;
select throws_ok($$select * from public.campaigns$$, '42501', null,
  'anon cannot read campaigns');
select throws_ok($$select * from public.member_case_counts$$, '42501', null,
  'anon cannot read case counts');
select throws_ok(
  $$select public.set_my_case_count((select campaign_id from fixture), '2026-10-01', 1)$$,
  '42501', null,
  'anon cannot call set_my_case_count');

-- =============================================================================
-- As admin D
-- =============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}';

select results_eq($$select count(*)::int from public.squads$$, $$values (2)$$,
  'admin can read all squads');
select results_eq(
  $$with u as (update public.monthly_targets set target_cases = 25
     where month = '2026-10-01' returning 1)
    select count(*)::int from u$$,
  $$values (1)$$,
  'admin can change a campaign target');
select results_eq(
  $$with u as (update public.member_case_counts set case_count = 5
     where squad_member_id = '20000000-0000-0000-0000-00000000000b' returning 1)
    select count(*)::int from u$$,
  $$values (1)$$,
  'admin can correct a member''s case count');
select results_eq(
  $$select old_count, new_count, changed_by from public.case_update_history
    where squad_member_id = '20000000-0000-0000-0000-00000000000b'
    order by id desc limit 1$$,
  $$values (4, 5, '00000000-0000-0000-0000-00000000000d'::uuid)$$,
  'admin corrections are audited with the admin as changed_by');
select lives_ok(
  $$insert into public.squad_members (squad_id, user_id)
    values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e')$$,
  'admin can add a member to a squad');
select throws_ok(
  $$update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000e'$$,
  '42501', null,
  'admin cannot grant admin through the API (service role / SQL only)');
select throws_ok(
  $$update public.case_update_history set new_count = 0$$,
  '42501', null,
  'admin cannot rewrite history');

reset role;
select * from finish();
rollback;
