-- Schema, privileges and data-integrity tests. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- ---------------------------------------------------------------------------
-- Tables, RLS and the derived progress view
-- ---------------------------------------------------------------------------
select tables_are(
  'public',
  array[
    'profiles', 'squads', 'squad_members', 'campaigns', 'monthly_targets',
    'member_case_counts', 'case_update_history'
  ],
  'public schema contains exactly the application tables'
);

select is(
  (select count(*)::int from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'RLS is enabled on every public table'
);

select views_are('public', array['squad_monthly_progress'],
  'squad progress is exposed only as a view');
select ok(
  (select 'security_invoker=true' = any(reloptions) from pg_class
   where oid = 'public.squad_monthly_progress'::regclass),
  'squad_monthly_progress runs with the caller''s RLS (security_invoker)'
);
select hasnt_column('public', 'squads', 'total_cases',
  'squad totals are not stored (no duplicated source of truth)');

-- ---------------------------------------------------------------------------
-- Grants: anon gets nothing; history is read-only; is_admin not updatable
-- ---------------------------------------------------------------------------
select table_privs_are('public', 'profiles', 'anon', array[]::text[], 'anon: no access to profiles');
select table_privs_are('public', 'squads', 'anon', array[]::text[], 'anon: no access to squads');
select table_privs_are('public', 'squad_members', 'anon', array[]::text[], 'anon: no access to squad_members');
select table_privs_are('public', 'campaigns', 'anon', array[]::text[], 'anon: no access to campaigns');
select table_privs_are('public', 'monthly_targets', 'anon', array[]::text[], 'anon: no access to monthly_targets');
select table_privs_are('public', 'member_case_counts', 'anon', array[]::text[], 'anon: no access to member_case_counts');
select table_privs_are('public', 'case_update_history', 'anon', array[]::text[], 'anon: no access to case_update_history');
select table_privs_are('public', 'squad_monthly_progress', 'anon', array[]::text[], 'anon: no access to squad_monthly_progress');
select function_privs_are('public', 'set_my_case_count', array['uuid', 'date', 'integer'],
  'anon', array[]::text[], 'anon cannot call set_my_case_count');

select table_privs_are('public', 'case_update_history', 'authenticated', array['SELECT'],
  'authenticated: case_update_history is read-only');
select table_privs_are('public', 'case_update_history', 'service_role', array['INSERT', 'SELECT'],
  'service_role: case_update_history is append-only');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated', 'service_role')
     and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0,
  'no API role can TRUNCATE, reference or add triggers to application tables'
);
select ok(not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'authenticated cannot update profiles.is_admin');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'INSERT'),
  'authenticated cannot insert profiles.is_admin');
select ok(not has_column_privilege('authenticated', 'public.member_case_counts', 'squad_member_id', 'UPDATE'),
  'authenticated cannot reassign a case count to another member');
select ok(has_column_privilege('authenticated', 'public.member_case_counts', 'case_count', 'UPDATE'),
  'authenticated can update case_count (row access is limited by RLS)');
select ok(not has_function_privilege('authenticated', 'private.handle_new_user()', 'EXECUTE'),
  'trigger functions are not executable by API roles');

-- ---------------------------------------------------------------------------
-- Campaign configuration is stored as data
-- ---------------------------------------------------------------------------
select results_eq(
  $$select t.month, t.target_cases from public.monthly_targets t
    join public.campaigns c on c.id = t.campaign_id
    where c.slug = 'q4-2026' order by t.month$$,
  $$values (date '2026-10-01', 20), (date '2026-11-01', 30), (date '2026-12-01', 40)$$,
  'Q4 2026 targets are 20 / 30 / 40'
);

select throws_ok(
  $$insert into public.monthly_targets (campaign_id, month, target_cases)
    select id, date '2027-01-01', 10 from public.campaigns where slug = 'q4-2026'$$,
  '23514', null, 'target months must fall inside the campaign'
);
select throws_ok(
  $$insert into public.monthly_targets (campaign_id, month, target_cases)
    select id, date '2026-10-15', 10 from public.campaigns where slug = 'q4-2026'$$,
  '23514', null, 'target months must be the first day of a month'
);

-- ---------------------------------------------------------------------------
-- Profiles, membership and case-count integrity
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'mike@example.test',
   '{"display_name": "Mike", "is_admin": true}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'jeremy@example.test', '{}');

select results_eq(
  $$select display_name, is_admin from public.profiles
    where id in ('aaaaaaaa-0000-0000-0000-000000000001',
                 'aaaaaaaa-0000-0000-0000-000000000002')
    order by id$$,
  $$values ('Mike', false), ('jeremy', false)$$,
  'sign-up creates a profile; metadata can never grant admin'
);

insert into public.squads (id, name)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'Test Squad');
insert into public.squad_members (id, squad_id, user_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001');

select throws_ok(
  $$insert into public.squads (name) values ('Second Squad');
    insert into public.squad_members (squad_id, user_id)
    select id, 'aaaaaaaa-0000-0000-0000-000000000001' from public.squads
    where name = 'Second Squad'$$,
  '23505', null, 'a user can belong to only one squad'
);

prepare insert_count(int) as
  insert into public.member_case_counts (squad_member_id, campaign_id, month, case_count)
  select 'cccccccc-0000-0000-0000-000000000001', id, date '2026-10-01', $1
  from public.campaigns where slug = 'q4-2026';

select throws_ok($$execute insert_count(-1)$$, '23514', null,
  'negative case counts are rejected');
select throws_ok($$execute insert_count(1001)$$, '23514', null,
  'unreasonably large case counts are rejected');
select throws_ok(
  $$insert into public.member_case_counts (squad_member_id, campaign_id, month, case_count)
    select 'cccccccc-0000-0000-0000-000000000001', id, date '2026-10-01', '6.5'
    from public.campaigns where slug = 'q4-2026'$$,
  '22P02', null, 'decimal case counts are rejected'
);
select throws_ok(
  $$insert into public.member_case_counts (squad_member_id, campaign_id, month, case_count)
    select 'cccccccc-0000-0000-0000-000000000001', id, date '2026-09-01', 1
    from public.campaigns where slug = 'q4-2026'$$,
  '23503', null, 'case counts can only exist for configured campaign months'
);

select lives_ok($$execute insert_count(6)$$, 'a valid case count is stored');
select throws_ok($$execute insert_count(7)$$, '23505', null,
  'one current count per member per campaign month');

update public.member_case_counts set case_count = 7
where squad_member_id = 'cccccccc-0000-0000-0000-000000000001';
update public.member_case_counts set case_count = 7
where squad_member_id = 'cccccccc-0000-0000-0000-000000000001';

select results_eq(
  $$select old_count, new_count from public.case_update_history
    where squad_member_id = 'cccccccc-0000-0000-0000-000000000001'
    order by id$$,
  $$values (0, 6), (6, 7)$$,
  'every change is recorded in history (no-op updates are skipped)'
);

select * from finish();
rollback;
