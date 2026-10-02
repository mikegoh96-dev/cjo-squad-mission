-- Public read access and update-link security tests. Run with: npx supabase test db
--
-- Fixture (rolled back): a campaign covering the CURRENT month (so the test is
-- independent of the date), squad Alpha (Mike, Jeremy), squad Bravo (Sarah).
-- Update links are issued with the admin function; raw tokens are kept in a
-- temp table so the anon role can "hold" them like a bookmarked URL.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

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

create temporary table links (who text primary key, token text not null);
insert into links values
  ('mike', public.admin_issue_update_token('20000000-0000-0000-0000-00000000000a')),
  ('jeremy', public.admin_issue_update_token('20000000-0000-0000-0000-00000000000b'));
grant select on links to anon, authenticated;

create temporary view counts_now as
  select squad_member_id, case_count from public.member_case_counts
  where month = date_trunc('month', now() at time zone 'Asia/Singapore')::date;
grant select on counts_now to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tokens are stored as hashes only
-- ---------------------------------------------------------------------------
select ok((select token ~ '^[0-9a-f]{64}$' from links where who = 'mike'),
  'issued token is 64 hex chars (256 bits)');
select is(
  (select count(*)::int from public.member_update_tokens t join links l
   on t.token_hash = sha256(convert_to(l.token, 'UTF8'))),
  2,
  'database stores SHA-256 of each token');
select is(
  (select count(*)::int from public.member_update_tokens t join links l
   on encode(t.token_hash, 'hex') = l.token or t.token_hash = convert_to(l.token, 'UTF8')),
  0,
  'raw tokens are not stored');

-- =============================================================================
-- As an anonymous visitor
-- =============================================================================
set local role anon;

select results_eq($$select name from public.squads order by name$$, $$values ('Alpha'), ('Bravo')$$,
  'anon can read squads');
select results_eq($$select display_name from public.members order by display_name$$,
  $$values ('Jeremy'), ('Mike'), ('Sarah')$$, 'anon can read member names');
select is((select count(*)::int from public.squad_members), 3, 'anon can read squad membership');
select is((select count(*)::int from public.monthly_targets), 1, 'anon can read campaign targets');
select results_eq(
  $$select squad_name, total_cases, target_cases from public.squad_monthly_progress order by squad_name$$,
  $$values ('Alpha', 4, 20), ('Bravo', 3, 20)$$,
  'anon can read derived squad progress');

-- Direct writes are impossible
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
select throws_ok($$update public.squad_members set squad_id = '10000000-0000-0000-0000-00000000000b'$$, '42501', null,
  'anon cannot change squad membership');
select throws_ok($$update public.monthly_targets set target_cases = 1$$, '42501', null,
  'anon cannot change targets');
select throws_ok($$insert into public.squads (name) values ('Fake')$$, '42501', null,
  'anon cannot create squads');
select throws_ok($$select * from public.member_update_tokens$$, '42501', null,
  'anon cannot read token hashes');
select throws_ok($$select * from public.case_update_history$$, '42501', null,
  'anon cannot read the audit history');
select throws_ok($$select public.admin_issue_update_token('20000000-0000-0000-0000-00000000000c')$$, '42501', null,
  'anon cannot issue update links');
select throws_ok($$select public.admin_revoke_update_token('20000000-0000-0000-0000-00000000000a')$$, '42501', null,
  'anon cannot revoke update links');
select throws_ok($$select * from public.admin_update_link_status()$$, '42501', null,
  'anon cannot list update links');

-- Valid link loads the right member
select results_eq(
  $$select member_name, squad_name, campaign_name, month, case_count
    from public.get_update_context((select token from links where who = 'mike'))$$,
  $$select 'Mike'::text, 'Alpha'::text, 'Test Campaign'::text,
           date_trunc('month', now() at time zone 'Asia/Singapore')::date, 0$$,
  'Mike''s link loads Mike, his squad and the open month');
select results_eq(
  $$select member_name, case_count from public.get_update_context((select token from links where who = 'jeremy'))$$,
  $$values ('Jeremy'::text, 4)$$,
  'Jeremy''s link loads Jeremy with his current count');

-- Invalid, guessed and malformed tokens load nothing
select is_empty($$select * from public.get_update_context(encode(gen_random_bytes(32), 'hex'))$$,
  'a random well-formed token loads nothing');
select is_empty($$select * from public.get_update_context('mike')$$, 'a name as token loads nothing');
select is_empty($$select * from public.get_update_context('')$$, 'an empty token loads nothing');
select is_empty($$select * from public.get_update_context(null)$$, 'a null token loads nothing');
select is_empty($$select * from public.get_update_context(upper((select token from links where who = 'mike')))$$,
  'a case-altered token loads nothing');
select is_empty($$select * from public.get_update_context((select token from links where who = 'mike') || ' or 1=1')$$,
  'an injection-style token loads nothing');

-- Valid submission updates only the link owner (current total, not increment)
select results_eq(
  $$select case_count from public.submit_case_count((select token from links where who = 'mike'), 6)$$,
  $$values (6)$$, 'Mike sets his count to 6');
select results_eq(
  $$select case_count from public.submit_case_count((select token from links where who = 'mike'), 6)$$,
  $$values (6)$$, 'submitting 6 again keeps 6 (no double counting)');
select results_eq(
  $$select case_count from public.submit_case_count((select token from links where who = 'mike'), 7)$$,
  $$values (7)$$, 'Mike updates his total to 7');
select results_eq(
  $$select squad_member_id, case_count from counts_now order by squad_member_id$$,
  $$values ('20000000-0000-0000-0000-00000000000a'::uuid, 7),
           ('20000000-0000-0000-0000-00000000000b'::uuid, 4),
           ('20000000-0000-0000-0000-00000000000c'::uuid, 3)$$,
  'Mike''s link changed only Mike''s count (Jeremy and Sarah untouched)');
select results_eq(
  $$select total_cases from public.squad_monthly_progress where squad_name = 'Alpha'$$,
  $$values (11)$$, 'Alpha total recalculates (7 + 4)');

-- Rejected submissions
select throws_ok($$select public.submit_case_count(encode(gen_random_bytes(32), 'hex'), 5)$$, '28000', null,
  'a guessed token cannot submit');
select throws_ok($$select public.submit_case_count('20000000-0000-0000-0000-00000000000b', 5)$$, '28000', null,
  'a member id used as the token cannot submit');
select throws_ok($$select public.submit_case_count(null, 5)$$, '28000', null, 'a null token cannot submit');
select throws_ok($$select public.submit_case_count((select token from links where who = 'mike'), -1)$$, '23514', null,
  'negative counts are rejected');
select throws_ok($$select public.submit_case_count((select token from links where who = 'mike'), 1001)$$, '23514', null,
  'counts above the maximum are rejected');
select throws_ok($$select public.submit_case_count((select token from links where who = 'mike'), '6.5')$$, '22P02', null,
  'decimal counts are rejected');
select throws_ok($$select public.submit_case_count((select token from links where who = 'mike'), 'seven')$$, '22P02', null,
  'non-numeric counts are rejected');
select throws_ok($$select public.submit_case_count((select token from links where who = 'mike'), null)$$, '22004', null,
  'missing counts are rejected');

-- =============================================================================
-- Admin: regenerate and revoke (as the table owner / SQL editor)
-- =============================================================================
reset role;
insert into links values ('mike-new', public.admin_issue_update_token('20000000-0000-0000-0000-00000000000a'));
select ok(public.admin_revoke_update_token('20000000-0000-0000-0000-00000000000b'), 'Jeremy''s link revoked');
select results_eq(
  $$select old_count, new_count, changed_by from public.case_update_history
    where squad_member_id = '20000000-0000-0000-0000-00000000000a' order by id$$,
  $$values (0, 6, '00000000-0000-0000-0000-00000000000a'::uuid), (6, 7, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'history records each real change, attributed to the link owner');

set local role anon;
select throws_ok($$select public.submit_case_count((select token from links where who = 'mike'), 8)$$, '28000', null,
  'the old link stops working immediately after regeneration');
select results_eq(
  $$select case_count from public.submit_case_count((select token from links where who = 'mike-new'), 8)$$,
  $$values (8)$$, 'the regenerated link works');
select throws_ok($$select public.submit_case_count((select token from links where who = 'jeremy'), 9)$$, '28000', null,
  'a revoked link stops working');

reset role;
select * from finish();
rollback;
