-- PC$ challenge: cumulative per-member production, saved in batches.
-- Run with: npx supabase test db. Everything is rolled back.
--
-- Fixture: a campaign with an OPEN challenge (window around now), a CLOSED one
-- and a NOT YET OPEN one; squad members Marcus and Jeremy.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into public.campaigns (id, slug, name, starts_on, ends_on) values
  ('dddddddd-0000-0000-0000-0000000000f1', 'test-pc', 'PC Campaign', '2026-01-01', '2026-03-31');
insert into public.pc_challenges
  (id, campaign_id, slug, name, eligible_from, eligible_to, target_amount, member_minimum, opens_at, closes_at) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', 'dddddddd-0000-0000-0000-0000000000f1', 'test-pc-open', 'Open PC challenge',
   '2026-01-01', '2026-01-31', 100000, 5000, now() - interval '1 day', now() + interval '1 day'),
  ('eeeeeeee-0000-0000-0000-0000000000f2', 'dddddddd-0000-0000-0000-0000000000f1', 'test-pc-closed', 'Closed PC challenge',
   '2026-02-01', '2026-02-28', 100000, 5000, now() - interval '3 days', now() - interval '1 second'),
  ('eeeeeeee-0000-0000-0000-0000000000f3', 'dddddddd-0000-0000-0000-0000000000f1', 'test-pc-later', 'Later PC challenge',
   '2026-03-01', '2026-03-31', 100000, 5000, now() + interval '1 day', now() + interval '2 days');
insert into public.members (id, display_name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Marcus'),
  ('00000000-0000-0000-0000-0000000000f2', 'Jeremy');
insert into public.squads (id, name) values ('10000000-0000-0000-0000-0000000000f1', 'PC Squad');
insert into public.squad_members (id, squad_id, member_id) values
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1'),
  ('20000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');

create function pg_temp.save(p_challenge uuid, p_entries text)
returns table (squad_member_id uuid, status text, amount bigint)
language sql as $$ select * from public.submit_pc_amounts(p_challenge, p_entries::jsonb) $$;

-- Schema and privileges ----------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.pc_challenges'::regclass), 'RLS on pc_challenges');
select ok((select relrowsecurity from pg_class where oid = 'public.member_pc_amounts'::regclass), 'RLS on member_pc_amounts');
select ok((select relrowsecurity from pg_class where oid = 'private.pc_amount_history'::regclass), 'RLS on the PC$ history');
select table_privs_are('public', 'pc_challenges', 'anon', array['SELECT'], 'anon: read-only challenges');
select table_privs_are('public', 'member_pc_amounts', 'anon', array['SELECT'], 'anon: read-only PC$ amounts');
select table_privs_are('public', 'member_pc_amounts', 'authenticated', array['SELECT'], 'authenticated: read-only PC$ amounts');
select table_privs_are('private', 'pc_amount_history', 'anon', array[]::text[], 'anon: no access to the PC$ history');
select function_privs_are('public', 'submit_pc_amounts', array['uuid', 'jsonb'], 'anon', array['EXECUTE'],
  'anon saves PC$ only through the controlled function');
select ok(not has_function_privilege('public', 'public.submit_pc_amounts(uuid, jsonb)', 'execute'), 'PUBLIC has no default execute');
select ok((select prosecdef from pg_proc where oid = 'public.submit_pc_amounts(uuid, jsonb)'::regprocedure), 'security definer');
select is((select proconfig from pg_proc where oid = 'public.submit_pc_amounts(uuid, jsonb)'::regprocedure),
  array['search_path=""'], 'empty search_path');
select ok(not has_function_privilege('anon', 'private.record_pc_amount_change()', 'execute'), 'history trigger is private');

-- As a browser ---------------------------------------------------------------------
set local role anon;

select throws_ok(
  $$insert into public.member_pc_amounts (challenge_id, squad_member_id, amount)
    values ('eeeeeeee-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f1', 9000)$$,
  '42501', null, 'anon cannot insert PC$ directly');
select throws_ok($$select * from private.pc_amount_history$$, '42501', null, 'anon cannot read the PC$ history');

select results_eq(
  $$select squad_member_id, status, amount from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
    '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 8000, "expected": null},
      {"squad_member_id": "20000000-0000-0000-0000-0000000000f2", "amount": 3500, "expected": null}]')
    order by 1$$,
  $$values ('20000000-0000-0000-0000-0000000000f1'::uuid, 'saved'::text, 8000::bigint),
           ('20000000-0000-0000-0000-0000000000f2'::uuid, 'saved'::text, 3500::bigint)$$,
  'one save stores several members (first entries: expected null)');
select results_eq(
  $$select squad_member_id, amount from public.member_pc_amounts
    where challenge_id = 'eeeeeeee-0000-0000-0000-0000000000f1' order by 1$$,
  $$values ('20000000-0000-0000-0000-0000000000f1'::uuid, 8000::bigint),
           ('20000000-0000-0000-0000-0000000000f2'::uuid, 3500::bigint)$$,
  'anon reads the stored amounts');

select results_eq(
  $$select status, amount from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
    '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 8000, "expected": 8000}]')$$,
  $$values ('unchanged'::text, 8000::bigint)$$, 'saving the same amount again changes nothing');
select results_eq(
  $$select status, amount from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
    '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 6000, "expected": 8000}]')$$,
  $$values ('saved'::text, 6000::bigint)$$, 'a correction replaces the cumulative amount (lower is allowed)');
select results_eq(
  $$select status, amount from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
    '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 9000, "expected": 8000}]')$$,
  $$values ('conflict'::text, 6000::bigint)$$, 'a stale screen gets a conflict and the current amount');
select results_eq(
  $$select status, amount from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
    '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f2", "amount": 4000, "expected": null}]')$$,
  $$values ('conflict'::text, 3500::bigint)$$, 'expected null when an amount exists is a conflict too');
select is((select amount from public.member_pc_amounts
  where challenge_id = 'eeeeeeee-0000-0000-0000-0000000000f1' and squad_member_id = '20000000-0000-0000-0000-0000000000f1'),
  6000::bigint, 'nothing was written on conflict');
select results_eq(
  $$select squad_member_id, status, amount from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
    '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f2", "amount": 0, "expected": 3500},
      {"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 7000, "expected": 1}]')
    order by 1$$,
  $$values ('20000000-0000-0000-0000-0000000000f1'::uuid, 'conflict'::text, 6000::bigint),
           ('20000000-0000-0000-0000-0000000000f2'::uuid, 'saved'::text, 0::bigint)$$,
  'a batch reports per member: one conflict does not block the others (zero is allowed)');

select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
  '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": -1, "expected": 6000}]')$$,
  '23514', null, 'negative amounts are rejected');
select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
  '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 100000001, "expected": 6000}]')$$,
  '23514', null, 'unreasonably large amounts are rejected');
select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
  '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 12.5, "expected": 6000}]')$$,
  '22P02', null, 'whole dollars only');
select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
  '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f9", "amount": 100, "expected": null}]')$$,
  '42704', null, 'unknown squad members are rejected');
select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1',
  '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 1, "expected": 6000},
    {"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 2, "expected": 6000}]')$$,
  '22023', null, 'a member may appear only once per save');
select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1', '[]')$$,
  '22023', null, 'an empty save is rejected');
select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f1', '{"amount": 1}')$$,
  '22023', null, 'entries must be an array');
select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f2',
  '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 100, "expected": null}]')$$,
  'P0002', null, 'a closed challenge accepts no entries');
select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f3',
  '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 100, "expected": null}]')$$,
  'P0002', null, 'a challenge that has not opened accepts no entries');
select throws_ok($$select * from pg_temp.save('eeeeeeee-0000-0000-0000-0000000000f9',
  '[{"squad_member_id": "20000000-0000-0000-0000-0000000000f1", "amount": 100, "expected": null}]')$$,
  '42704', null, 'unknown challenges are rejected');
select is((select amount from public.member_pc_amounts
  where challenge_id = 'eeeeeeee-0000-0000-0000-0000000000f1' and squad_member_id = '20000000-0000-0000-0000-0000000000f1'),
  6000::bigint, 'rejected saves wrote nothing');

-- Case counts are untouched by PC$ ---------------------------------------------------
reset role;
select is((select count(*)::int from public.member_case_counts
  where squad_member_id in ('20000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f2')),
  0, 'PC$ saves never touch case counts');

-- Audit history -----------------------------------------------------------------------
select results_eq(
  $$select squad_member_id, old_amount, new_amount from private.pc_amount_history
    where challenge_id = 'eeeeeeee-0000-0000-0000-0000000000f1' order by id$$,
  $$values ('20000000-0000-0000-0000-0000000000f1'::uuid, null::bigint, 8000::bigint),
           ('20000000-0000-0000-0000-0000000000f2'::uuid, null::bigint, 3500::bigint),
           ('20000000-0000-0000-0000-0000000000f1'::uuid, 8000::bigint, 6000::bigint),
           ('20000000-0000-0000-0000-0000000000f2'::uuid, 3500::bigint, 0::bigint)$$,
  'every real change is recorded once, oldest first (unchanged saves and conflicts add nothing)');

delete from public.squad_members where id = '20000000-0000-0000-0000-0000000000f2';
select is((select count(*)::int from public.member_pc_amounts where squad_member_id = '20000000-0000-0000-0000-0000000000f2'),
  0, 'removing a member removes their PC$ amounts');

select * from finish();
rollback;
