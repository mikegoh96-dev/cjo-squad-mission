-- Schema, privileges and data-integrity tests. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- ---------------------------------------------------------------------------
-- Tables, RLS and the derived progress view
-- ---------------------------------------------------------------------------
select tables_are(
  'public',
  array[
    'members', 'squads', 'squad_members', 'campaigns', 'monthly_targets',
    'member_case_counts', 'case_update_history', 'push_subscriptions',
    'member_checkins', 'squad_cheers', 'pc_challenges', 'member_pc_amounts'
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
-- No Supabase Auth dependency remains
-- ---------------------------------------------------------------------------
select hasnt_trigger('auth', 'users', 'on_auth_user_created', 'no sign-up trigger on auth.users');
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.members'::regclass and confrelid = 'auth.users'::regclass),
  0,
  'members do not reference auth.users'
);
select hasnt_column('public', 'members', 'is_admin', 'no auth-era admin flag');
select is(
  (select count(*)::int from pg_proc where proname = 'set_my_case_count'),
  0,
  'auth-based set_my_case_count is gone'
);

-- ---------------------------------------------------------------------------
-- Grants: public read-only; no direct writes; private tables stay private
-- ---------------------------------------------------------------------------
select table_privs_are('public', 'members', 'anon', array['SELECT'], 'anon: read-only members');
select table_privs_are('public', 'squads', 'anon', array['SELECT'], 'anon: read-only squads');
select table_privs_are('public', 'squad_members', 'anon', array['SELECT'], 'anon: read-only squad_members');
select table_privs_are('public', 'campaigns', 'anon', array['SELECT'], 'anon: read-only campaigns');
select table_privs_are('public', 'monthly_targets', 'anon', array['SELECT'], 'anon: read-only monthly_targets');
select table_privs_are('public', 'member_case_counts', 'anon', array['SELECT'], 'anon: read-only member_case_counts');
select table_privs_are('public', 'squad_monthly_progress', 'anon', array['SELECT'], 'anon: read-only progress view');
select table_privs_are('public', 'case_update_history', 'anon', array[]::text[], 'anon: no access to history');
select table_privs_are('public', 'member_case_counts', 'authenticated', array['SELECT'], 'authenticated: read-only counts');

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated', 'service_role')
     and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0,
  'no API role can TRUNCATE, reference or add triggers to application tables'
);
select is(
  (select count(*)::int from information_schema.columns c
   join information_schema.role_table_grants g
     on g.table_schema = c.table_schema and g.table_name = c.table_name
   where c.table_schema = 'public' and g.grantee = 'anon' and c.column_name ilike '%token%'),
  0,
  'no column readable by anon contains token data'
);

-- ---------------------------------------------------------------------------
-- Functions: the only write path and the read-only dashboard helpers
-- ---------------------------------------------------------------------------
select function_privs_are('public', 'submit_case_count', array['uuid', 'integer', 'integer'], 'anon', array['EXECUTE'],
  'anon can submit a count through the controlled function');
select function_privs_are('public', 'squad_member_momentum', array['uuid'], 'anon', array['EXECUTE'],
  'anon can read per-member momentum');
select function_privs_are('public', 'squad_momentum', array['uuid'], 'anon', array['EXECUTE'],
  'anon can read squad momentum');
select function_privs_are('public', 'member_recent_updates', array['uuid', 'integer'], 'anon', array['EXECUTE'],
  'anon can read a member''s recent updates');
select function_privs_are('public', 'squad_recap_history', array['uuid', 'uuid', 'timestamp with time zone'], 'anon', array['EXECUTE'],
  'anon can read the squad''s change history for a recap');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_case_count'),
  1,
  'submit_case_count has a single signature (member, count, expected)'
);
select is(
  (select count(*)::int from pg_proc
   where proname in ('get_update_context', 'admin_issue_update_token', 'admin_revoke_update_token',
                     'admin_update_link_status', 'member_for_token', 'token_hash')),
  0,
  'private update-link functions are gone'
);
select ok(not has_function_privilege('anon', 'private.current_campaign_month()', 'EXECUTE'),
  'private helpers are not executable by API roles');

select is(
  (select array_agg(tablename::text order by tablename::text) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'),
  array['member_case_counts', 'squad_cheers', 'squad_members'],
  'case counts, squad membership and cheers are broadcast for real-time sync (and nothing else)'
);

-- ---------------------------------------------------------------------------
-- Campaign configuration is stored as data
-- ---------------------------------------------------------------------------
-- The q4-2026 campaign (Oct-Dec 2026; 20 / 30 / 40) is the test fixture. A
-- deployment's own campaign seed may differ, so create it when missing
-- (rolled back with everything else).
insert into public.campaigns (slug, name, starts_on, ends_on)
  values ('q4-2026', 'Test campaign Q4 2026', '2026-10-01', '2026-12-31')
  on conflict (slug) do nothing;
insert into public.monthly_targets (campaign_id, month, target_cases)
  select c.id, t.month, t.target_cases from public.campaigns c
  cross join (values (date '2026-10-01', 20), (date '2026-11-01', 30), (date '2026-12-01', 40))
    as t (month, target_cases)
  where c.slug = 'q4-2026'
  on conflict (campaign_id, month) do nothing;
select col_default_is('public', 'campaigns', 'time_zone', 'Asia/Singapore',
  'campaign months resolve in the campaign time zone (data)');
select throws_ok(
  $$insert into public.monthly_targets (campaign_id, month, target_cases)
    select id, date '2027-01-01', 10 from public.campaigns where slug = 'q4-2026'$$,
  '23514', null, 'target months must fall inside the campaign'
);

-- ---------------------------------------------------------------------------
-- Case-count integrity (direct writes as the table owner)
-- ---------------------------------------------------------------------------
insert into public.members (id, display_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Marcus');
insert into public.squads (id, name)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'Test Squad');
insert into public.squad_members (id, squad_id, member_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001');

prepare insert_count(int) as
  insert into public.member_case_counts (squad_member_id, campaign_id, month, case_count)
  select 'cccccccc-0000-0000-0000-000000000001', id, date '2026-10-01', $1
  from public.campaigns where slug = 'q4-2026';

select throws_ok($$execute insert_count(-1)$$, '23514', null, 'negative case counts are rejected');
select throws_ok($$execute insert_count(1001)$$, '23514', null, 'unreasonably large case counts are rejected');

select * from finish();
rollback;
