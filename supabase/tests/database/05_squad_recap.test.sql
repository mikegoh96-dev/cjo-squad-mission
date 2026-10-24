-- Squad Recap history (read-only). Run with: npx supabase test db
--
-- Fixture (rolled back): a past campaign (Jan-Feb 2026) with squad Alpha (Mike,
-- Jeremy) and squad Bravo (Sarah); history rows at fixed times.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.campaigns (id, slug, name, starts_on, ends_on) values
  ('dddddddd-0000-0000-0000-0000000000e1', 'test-recap', 'Recap Campaign', '2026-01-01', '2026-02-28'),
  ('dddddddd-0000-0000-0000-0000000000e2', 'test-other', 'Other Campaign', '2026-03-01', '2026-03-31');
insert into public.monthly_targets (campaign_id, month, target_cases) values
  ('dddddddd-0000-0000-0000-0000000000e1', '2026-01-01', 10),
  ('dddddddd-0000-0000-0000-0000000000e1', '2026-02-01', 12),
  ('dddddddd-0000-0000-0000-0000000000e2', '2026-03-01', 5);
insert into public.members (id, display_name) values
  ('00000000-0000-0000-0000-0000000000e1', 'Mike'),
  ('00000000-0000-0000-0000-0000000000e2', 'Jeremy'),
  ('00000000-0000-0000-0000-0000000000e3', 'Sarah');
insert into public.squads (id, name, created_at) values
  ('10000000-0000-0000-0000-0000000000e1', 'Alpha', now() - interval '10 years'),
  ('10000000-0000-0000-0000-0000000000e2', 'Bravo', now() - interval '9 years');
insert into public.squad_members (id, squad_id, member_id) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1'),
  ('20000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2'),
  ('20000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3');

insert into public.case_update_history (squad_member_id, campaign_id, month, old_count, new_count, changed_at) values
  -- Alpha, January: +2, +1, a correction -1, and a zero change (skipped).
  ('20000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e1', '2026-01-01', 0, 2, '2026-01-05 02:00+00'),
  ('20000000-0000-0000-0000-0000000000e2', 'dddddddd-0000-0000-0000-0000000000e1', '2026-01-01', 0, 1, '2026-01-06 03:00+00'),
  ('20000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e1', '2026-01-01', 2, 1, '2026-01-07 04:00+00'),
  ('20000000-0000-0000-0000-0000000000e2', 'dddddddd-0000-0000-0000-0000000000e1', '2026-01-01', 1, 1, '2026-01-08 04:00+00'),
  -- Alpha, February: +3.
  ('20000000-0000-0000-0000-0000000000e2', 'dddddddd-0000-0000-0000-0000000000e1', '2026-02-01', 0, 3, '2026-02-02 01:00+00'),
  -- Bravo, January (another squad: never returned for Alpha).
  ('20000000-0000-0000-0000-0000000000e3', 'dddddddd-0000-0000-0000-0000000000e1', '2026-01-01', 0, 4, '2026-01-05 05:00+00'),
  -- Alpha, another campaign (never returned for this campaign).
  ('20000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e2', '2026-03-01', 1, 5, '2026-03-02 01:00+00');

-- Privileges --------------------------------------------------------------------
select ok(has_function_privilege('anon', 'public.squad_recap_history(uuid, uuid, timestamptz)', 'execute'),
  'anon may call squad_recap_history');
select ok(has_function_privilege('authenticated', 'public.squad_recap_history(uuid, uuid, timestamptz)', 'execute'),
  'authenticated may call squad_recap_history');
select ok(not has_function_privilege('public', 'public.squad_recap_history(uuid, uuid, timestamptz)', 'execute'),
  'PUBLIC has no default execute');
select is((select provolatile::text from pg_proc where oid = 'public.squad_recap_history(uuid, uuid, timestamptz)'::regprocedure),
  's', 'the function is STABLE (read-only)');
select ok((select prosecdef from pg_proc where oid = 'public.squad_recap_history(uuid, uuid, timestamptz)'::regprocedure),
  'security definer');
select is((select proconfig from pg_proc where oid = 'public.squad_recap_history(uuid, uuid, timestamptz)'::regprocedure),
  array['search_path=""'], 'empty search_path');

-- As a browser ------------------------------------------------------------------
set local role anon;

select results_eq(
  $$select changed_at, month, delta, squad_member_id
    from public.squad_recap_history('10000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e1', now())$$,
  $$values
    ('2026-01-05 02:00+00'::timestamptz, '2026-01-01'::date, 2, '20000000-0000-0000-0000-0000000000e1'::uuid),
    ('2026-01-06 03:00+00'::timestamptz, '2026-01-01'::date, 1, '20000000-0000-0000-0000-0000000000e2'::uuid),
    ('2026-01-07 04:00+00'::timestamptz, '2026-01-01'::date, -1, '20000000-0000-0000-0000-0000000000e1'::uuid),
    ('2026-02-02 01:00+00'::timestamptz, '2026-02-01'::date, 3, '20000000-0000-0000-0000-0000000000e2'::uuid)$$,
  'returns the squad''s changes for the campaign, oldest first, with net deltas (corrections negative, zero changes skipped)'
);
select is(
  (select count(*)::int from public.squad_recap_history('10000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e1', '2026-01-07 04:00+00')),
  2, 'p_until is exclusive'
);
select is(
  (select count(*)::int from public.squad_recap_history('10000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e1', null)),
  4, 'a null p_until means now'
);
select is(
  (select count(*)::int from public.squad_recap_history('10000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e1', 'infinity')),
  4, 'p_until is capped at now'
);
select is(
  (select sum(delta)::int from public.squad_recap_history('10000000-0000-0000-0000-0000000000e2', 'dddddddd-0000-0000-0000-0000000000e1', now())),
  4, 'another squad sees only its own changes'
);
select is(
  (select count(*)::int from public.squad_recap_history('10000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e2', now())),
  1, 'filtered by campaign'
);
select is(
  (select count(*)::int from public.squad_recap_history('10000000-0000-0000-0000-0000000000ff', 'dddddddd-0000-0000-0000-0000000000e1', now())),
  0, 'an unknown squad returns nothing'
);
select throws_ok($$select count(*) from public.case_update_history$$, '42501', null,
  'the raw history table stays unreadable');

-- Removed member: cascade removes their history, so it never appears.
reset role;
delete from public.squad_members where id = '20000000-0000-0000-0000-0000000000e2';
set local role anon;
select is(
  (select coalesce(sum(delta), 0)::int from public.squad_recap_history('10000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e1', now())),
  1, 'a removed member''s changes are gone with them'
);
select throws_ok(
  $$insert into public.case_update_history (squad_member_id, campaign_id, month, old_count, new_count)
    values ('20000000-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000e1', '2026-01-01', 1, 9)$$,
  '42501', null, 'browsers still cannot write history'
);

select * from finish();
rollback;
