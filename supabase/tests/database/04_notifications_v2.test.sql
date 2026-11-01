-- Notifications V2: outbox, consolidation, milestones/rally, quiet hours,
-- reminders (cap 3), weekly recap, retries, routing, cheers.
-- Run with: npx supabase test db. Uses a fake clock (p_now) throughout, so it
-- does not depend on today's date. Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(133);

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

-- -----------------------------------------------------------------------------
-- Fixture
-- -----------------------------------------------------------------------------
delete from private.notification_jobs;
delete from private.notification_activity_items;
delete from private.notification_milestones;
delete from private.checkin_reminders;
delete from public.push_subscriptions;
delete from private.push_settings;
insert into private.push_settings (secret_hash)
values (sha256(convert_to('test-secret-0123456789abcdef0123456789', 'UTF8')));

insert into public.members (id, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Marcus'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Ben'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Daniel');
insert into public.squads (id, name, created_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Test squad', '2000-01-01');
insert into public.squad_members (id, squad_id, member_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003');

-- d1: plain phone (later Daniel's)   d2: Ben's phone
-- d3: Marcus's phone, activity + reminders off   d4: plain phone used for failures
insert into public.push_subscriptions (id, endpoint, p256dh, auth, squad_member_id, linked_at, pref_activity, pref_reminders) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'https://fcm.googleapis.com/fcm/send/d1', 'BPkeyPkeyPkeyPkeyPkeyPkey01', 'authsecret01', null, null, true, true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'https://web.push.apple.com/d2', 'BPkeyPkeyPkeyPkeyPkeyPkey02', 'authsecret02', 'cccccccc-0000-0000-0000-000000000002', '2026-10-20 10:00+08', true, true),
  ('eeeeeeee-0000-0000-0000-000000000003', 'https://fcm.googleapis.com/fcm/send/d3', 'BPkeyPkeyPkeyPkeyPkeyPkey03', 'authsecret03', 'cccccccc-0000-0000-0000-000000000001', '2026-10-20 10:00+08', false, false),
  ('eeeeeeee-0000-0000-0000-000000000004', 'https://fcm.googleapis.com/fcm/send/d4', 'BPkeyPkeyPkeyPkeyPkeyPkey04', 'authsecret04', null, null, true, true);

-- Change a member's count at a given (fake) time, as a committed save would.
create function pg_temp.bump(p_member uuid, p_month date, p_delta integer, p_at timestamptz)
returns void language plpgsql as $$
begin
  insert into public.member_case_counts (squad_member_id, campaign_id, month, case_count)
  values (p_member, (select id from public.campaigns where slug = 'q4-2026'), p_month, greatest(p_delta, 0))
  on conflict on constraint member_case_counts_one_per_month
    do update set case_count = public.member_case_counts.case_count + p_delta;
  update public.case_update_history set changed_at = p_at
   where id = (select max(id) from public.case_update_history);
end;
$$;
create function pg_temp.t(p text) returns timestamptz language sql as $$
  select (p::timestamp) at time zone 'Asia/Singapore';
$$;
create function pg_temp.jobs(p_kind text) returns bigint language sql as $$
  select count(*) from private.notification_jobs where kind = p_kind and dedupe_key not like 'test:%';
$$;


-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.member_checkins', 'select'), 'anon cannot read check-ins');
select ok(not has_table_privilege('anon', 'public.member_checkins', 'insert'), 'anon cannot write check-ins');
select ok(not has_table_privilege('anon', 'private.notification_jobs', 'select'), 'anon cannot read the outbox');
select ok(not has_table_privilege('anon', 'private.checkin_reminders', 'select'), 'anon cannot read reminders');
select ok(has_table_privilege('anon', 'public.squad_cheers', 'select'), 'anon can read recent cheers');
select ok(not has_table_privilege('anon', 'public.squad_cheers', 'insert'), 'anon cannot insert cheers directly');
select ok(not has_function_privilege('anon', 'private.plan_notifications(timestamptz)', 'execute'), 'planner is private');
select ok(not has_function_privilege('anon', 'private.claim_notifications(timestamptz, integer)', 'execute'), 'claim is private');
select ok(not has_function_privilege('anon', 'private.confirm_checkin_at(uuid, integer, timestamptz)', 'execute'), 'fake-clock check-in is private');
select is((select count(*)::int from pg_policies where tablename = 'member_checkins'), 0, 'check-ins: no policies (functions only)');

set local role anon;
select throws_ok($$select public.notify_plan('wrong')$$, '42501', 'not allowed', 'planning needs the server secret');
select throws_ok($$select * from public.notify_claim('wrong', 5)$$, '42501', 'not allowed', 'claiming needs the server secret');
select throws_ok($$select public.notify_complete('wrong', 1, gen_random_uuid(), '[]')$$, '42501', 'not allowed', 'completing needs the server secret');
select throws_ok($$select count(*) from public.member_checkins$$, '42501', null, 'browsers cannot list check-ins');
select lives_ok($$select public.notify_plan('test-secret-0123456789abcdef0123456789')$$, 'the server can plan with the secret');
reset role;

-- -----------------------------------------------------------------------------
-- Activity consolidation (October target 20: started 1, halfway 10,
-- momentum 15, rally 18, cleared 20)
-- -----------------------------------------------------------------------------
delete from private.notification_jobs; -- drop anything the real-clock plan above made

select pg_temp.bump('cccccccc-0000-0000-0000-000000000001', '2026-10-01', 1, pg_temp.t('2026-10-14 10:00:00'));
select private.plan_notifications(pg_temp.t('2026-10-14 10:00:30'));
select is(pg_temp.jobs('milestone') + pg_temp.jobs('activity'), 0::bigint, 'nothing is sent inside the 60-second window');
select private.plan_notifications(pg_temp.t('2026-10-14 10:01:01'));
select is(pg_temp.jobs('milestone'), 1::bigint, 'the first case of the month is a milestone');
select is((select payload ->> 'key' from private.notification_jobs where kind = 'milestone'), 'started', 'milestone = started');
select is((select priority from private.notification_jobs where kind = 'milestone'), 1::smallint, 'milestones are high priority');
select is((select payload -> 'names' from private.notification_jobs where kind = 'milestone'), '["Marcus"]'::jsonb, 'milestone credits the contributor');
select is((select (payload ->> 'covered')::boolean from private.notification_jobs where kind = 'activity'), true,
  'the activity job for a milestone batch is marked covered (only for phones with milestones off)');

select pg_temp.bump('cccccccc-0000-0000-0000-000000000002', '2026-10-01', 1, pg_temp.t('2026-10-14 11:00:00'));
select pg_temp.bump('cccccccc-0000-0000-0000-000000000003', '2026-10-01', 2, pg_temp.t('2026-10-14 11:00:20'));
select pg_temp.bump('cccccccc-0000-0000-0000-000000000002', '2026-10-01', 1, pg_temp.t('2026-10-14 11:00:40'));
select private.plan_notifications(pg_temp.t('2026-10-14 11:00:59'));
select is(pg_temp.jobs('activity'), 1::bigint, 'the window counts from the first update');
select private.plan_notifications(pg_temp.t('2026-10-14 11:01:05'));
select is(pg_temp.jobs('activity'), 2::bigint, 'three rapid updates become one activity job');
select is(
  (select payload from private.notification_jobs where kind = 'activity' order by id desc limit 1),
  '{"month": "2026-10-01", "total": 5, "target": 20, "names": ["Ben", "Daniel"], "covered": false}'::jsonb,
  'activity payload: contributors A-Z, squad total, no individual totals');
select private.plan_notifications(pg_temp.t('2026-10-14 11:01:30'));
select is(pg_temp.jobs('activity'), 2::bigint, 'planning again creates nothing new (idempotent)');
select is((select count(*)::int from private.notification_activity_items where job_id is not null), 4,
  'each committed update belongs to exactly one batch');

select pg_temp.bump('cccccccc-0000-0000-0000-000000000003', '2026-10-01', -1, pg_temp.t('2026-10-14 12:00:00'));
select private.plan_notifications(pg_temp.t('2026-10-14 12:02:00'));
select is(pg_temp.jobs('activity'), 2::bigint, 'a correction alone never notifies');
select ok((select job_id is null from private.notification_activity_items
            where history_id = (select max(id) from public.case_update_history)), 'the correction is still marked processed');

-- -----------------------------------------------------------------------------
-- Claim, recipients, retries
-- -----------------------------------------------------------------------------
create temp table c1 as select * from private.claim_notifications(pg_temp.t('2026-10-14 12:02:10'), 10);
select is((select count(*)::int from c1), 2, 'claim returns the milestone and the routine activity job');
select is((select kind from c1 order by job_id limit 1), 'milestone', 'the milestone is first');
select is(
  (select status from private.notification_jobs where kind = 'activity' and (payload ->> 'covered')::boolean),
  'done', 'covered activity with no milestones-off phones finishes without sending');
select set_eq(
  $$select (r ->> 'id')::uuid from c1, jsonb_array_elements(recipients) r where kind = 'milestone'$$,
  $$values ('eeeeeeee-0000-0000-0000-000000000001'::uuid), ('eeeeeeee-0000-0000-0000-000000000002'::uuid),
           ('eeeeeeee-0000-0000-0000-000000000003'::uuid), ('eeeeeeee-0000-0000-0000-000000000004'::uuid)$$,
  'milestones go to every opted-in phone');
select set_eq(
  $$select (r ->> 'id')::uuid from c1, jsonb_array_elements(recipients) r where kind = 'activity'$$,
  $$values ('eeeeeeee-0000-0000-0000-000000000001'::uuid), ('eeeeeeee-0000-0000-0000-000000000002'::uuid),
           ('eeeeeeee-0000-0000-0000-000000000004'::uuid)$$,
  'activity goes to every phone with activity on (no originating-device exclusion), not to d3 (off)');
select is((select count(*)::int from private.claim_notifications(pg_temp.t('2026-10-14 12:02:20'), 10)), 0,
  'a second worker cannot claim jobs already claimed');

select is(private.complete_notification((select job_id from c1 where kind = 'activity'), gen_random_uuid(), '[]', pg_temp.t('2026-10-14 12:02:30')),
  'stale_claim', 'a wrong claim token is ignored');

create temp table counts_before as select squad_member_id, month, case_count from public.member_case_counts;
select is(private.complete_notification(
  (select job_id from c1 where kind = 'milestone'), (select claim_token from c1 where kind = 'milestone'),
  jsonb_build_array(
    jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000001', 'outcome', 'accepted', 'code', 201),
    jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000002', 'outcome', 'accepted', 'code', 201),
    jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000003', 'outcome', 'accepted', 'code', 201),
    jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000004', 'outcome', 'accepted', 'code', 201)),
  pg_temp.t('2026-10-14 12:02:30')), 'done', 'all accepted: done');
select is(private.complete_notification(
  (select job_id from c1 where kind = 'activity'), (select claim_token from c1 where kind = 'activity'),
  jsonb_build_array(
    jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000001', 'outcome', 'accepted', 'code', 201),
    jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000002', 'outcome', 'accepted', 'code', 201),
    jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000004', 'outcome', 'retry', 'code', 503)),
  pg_temp.t('2026-10-14 12:02:30')), 'pending', 'a transient failure schedules a retry');
select is((select scheduled_for from private.notification_jobs where id = (select job_id from c1 where kind = 'activity')),
  pg_temp.t('2026-10-14 12:03:30'), 'first retry after 1 minute');
select is((select push_service from private.notification_deliveries where subscription_id = 'eeeeeeee-0000-0000-0000-000000000004' and status = 'retry'),
  'fcm.googleapis.com', 'deliveries record the push host only (never the endpoint)');
select is((select count(*)::int from private.claim_notifications(pg_temp.t('2026-10-14 12:03:00'), 10)), 0, 'no retry before its time');

create temp table c2 as select * from private.claim_notifications(pg_temp.t('2026-10-14 12:03:31'), 10);
select is((select recipients from c2), '[{"id": "eeeeeeee-0000-0000-0000-000000000004", "auth": "authsecret04", "p256dh": "BPkeyPkeyPkeyPkeyPkeyPkey04", "endpoint": "https://fcm.googleapis.com/fcm/send/d4"}]'::jsonb,
  'the retry only goes to the phone that failed');
select is(private.complete_notification((select job_id from c2), (select claim_token from c2),
  jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000004', 'outcome', 'gone', 'code', 410)),
  pg_temp.t('2026-10-14 12:03:40')), 'done', 'gone: done');
select ok(not exists (select 1 from public.push_subscriptions where id = 'eeeeeeee-0000-0000-0000-000000000004'), 'a gone phone is removed');
select is((select count(*)::int from public.push_subscriptions), 3, 'healthy phones are kept');
select is((select accepted_count || '/' || gone_count from private.notification_jobs where id = (select job_id from c2)), '2/1',
  'job counters: 2 accepted, 1 gone');
select set_eq($$select squad_member_id, month, case_count from public.member_case_counts$$,
  $$select * from counts_before$$, 'sending and retrying never change case counts');

-- -----------------------------------------------------------------------------
-- Quiet hours (22:00-08:00 SGT)
-- -----------------------------------------------------------------------------
select ok(private.notify_in_quiet(pg_temp.t('2026-10-14 22:00:00')), '22:00 is quiet');
select ok(private.notify_in_quiet(pg_temp.t('2026-10-15 07:59:59')), '07:59 is quiet');
select ok(not private.notify_in_quiet(pg_temp.t('2026-10-15 08:00:00')), '08:00 is not quiet');
select ok(not private.notify_in_quiet(pg_temp.t('2026-10-14 21:59:59')), '21:59 is not quiet');
select is(private.notify_next_allowed(pg_temp.t('2026-10-14 23:10')), pg_temp.t('2026-10-15 08:00'), 'late evening -> 08:00 next day');
select is(private.notify_next_allowed(pg_temp.t('2026-10-15 03:00')), pg_temp.t('2026-10-15 08:00'), 'early morning -> 08:00 same day');
select is(private.notify_next_allowed('2026-10-14 15:30+00'), '2026-10-15 00:00+00'::timestamptz, 'computed in Singapore time, not the server zone');

select pg_temp.bump('cccccccc-0000-0000-0000-000000000001', '2026-10-01', 2, pg_temp.t('2026-10-14 23:00:00'));
select pg_temp.bump('cccccccc-0000-0000-0000-000000000003', '2026-10-01', 2, pg_temp.t('2026-10-15 02:00:00'));
select private.plan_notifications(pg_temp.t('2026-10-15 03:30'));
select is(pg_temp.jobs('activity'), 2::bigint, 'overnight updates are not batched during quiet hours');
insert into private.notification_jobs (kind, dedupe_key, scheduled_for, payload, created_at)
values ('activity', 'test:due-at-night', pg_temp.t('2026-10-14 21:00'), '{}', pg_temp.t('2026-10-14 21:00'));
select is((select count(*)::int from private.claim_notifications(pg_temp.t('2026-10-15 07:59:59'), 10)), 0,
  'nothing is claimed during quiet hours, even a job that was due earlier');
delete from private.notification_jobs where dedupe_key = 'test:due-at-night';
select private.plan_notifications(pg_temp.t('2026-10-15 08:00:30'));
select is(pg_temp.jobs('activity'), 3::bigint, 'overnight activity becomes one morning update');
select is((select payload -> 'names' from private.notification_jobs where kind = 'activity' order by id desc limit 1),
  '["Daniel", "Marcus"]'::jsonb, 'the morning update names everyone who added overnight');
select is((select scheduled_for from private.notification_jobs where kind = 'activity' order by id desc limit 1),
  pg_temp.t('2026-10-15 08:00:30'), 'and is due straight away');

create temp table cm1 as select * from private.claim_notifications(pg_temp.t('2026-10-15 08:00:40'), 10);
select is((select kind from cm1), 'activity', 'the morning update is claimed');
select private.complete_notification((select job_id from cm1), (select claim_token from cm1),
  jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000001', 'outcome', 'accepted', 'code', 201),
                    jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000002', 'outcome', 'accepted', 'code', 201)),
  pg_temp.t('2026-10-15 08:00:41'));

-- Retry that would land in quiet hours waits for the morning.
insert into private.notification_jobs (kind, dedupe_key, scheduled_for, payload, created_at)
values ('recap', 'test:night-retry', pg_temp.t('2026-10-15 21:59'), '{}', pg_temp.t('2026-10-15 21:59'));
create temp table c3 as select * from private.claim_notifications(pg_temp.t('2026-10-15 21:59:30'), 10);
select is(private.complete_notification((select job_id from c3), (select claim_token from c3),
  jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000001', 'outcome', 'retry', 'code', 500),
                    jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000002', 'outcome', 'accepted', 'code', 201)),
  pg_temp.t('2026-10-15 21:59:40')), 'pending', 'retry scheduled');
select is((select scheduled_for from private.notification_jobs where id = (select job_id from c3)),
  pg_temp.t('2026-10-16 08:00'), 'a retry never lands in quiet hours');
-- A worker that dies mid-send: the lease expires and the job is claimed again.
create temp table c4 as select * from private.claim_notifications(pg_temp.t('2026-10-16 08:00:05'), 10);
select is((select attempts from private.notification_jobs where id = (select job_id from c4)), 2, 'second attempt');
select is((select count(*)::int from private.claim_notifications(pg_temp.t('2026-10-16 08:01:00'), 10)), 0, 'lease still held');
create temp table c5 as select * from private.claim_notifications(pg_temp.t('2026-10-16 08:02:10'), 10);
select is((select job_id from c5), (select job_id from c4), 'after the lease expires the job is reclaimed');
select is(private.complete_notification((select job_id from c4), (select claim_token from c4), '[]', pg_temp.t('2026-10-16 08:02:20')),
  'stale_claim', 'the dead worker''s late report is ignored');
select is(private.complete_notification((select job_id from c5), (select claim_token from c5),
  jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000001', 'outcome', 'rejected', 'code', 400)),
  pg_temp.t('2026-10-16 08:02:30')), 'done', 'a rejected payload is not retried');

-- Bounded retries.
update private.notify_policy set max_attempts = 2;
insert into private.notification_jobs (kind, dedupe_key, scheduled_for, payload, created_at)
values ('recap', 'test:bounded', pg_temp.t('2026-10-16 09:00'), '{}', pg_temp.t('2026-10-16 09:00'));
create temp table c6 as select * from private.claim_notifications(pg_temp.t('2026-10-16 09:00:01'), 10);
select private.complete_notification((select job_id from c6), (select claim_token from c6),
  jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000001', 'outcome', 'retry', 'code', 503)),
  pg_temp.t('2026-10-16 09:00:02'));
create temp table c7 as select * from private.claim_notifications(pg_temp.t('2026-10-16 09:01:03'), 10);
select is(private.complete_notification((select job_id from c7), (select claim_token from c7),
  jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000001', 'outcome', 'retry', 'code', 503)),
  pg_temp.t('2026-10-16 09:01:04')), 'failed', 'retries stop at max_attempts');
select ok(exists (select 1 from public.push_subscriptions where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'a transient failure never removes the phone');
update private.notify_policy set max_attempts = 5;
delete from private.notification_jobs where dedupe_key = 'test:bounded';

-- -----------------------------------------------------------------------------
-- Milestones: several thresholds in one batch; exactly once
-- -----------------------------------------------------------------------------
-- October total is now 8.
select pg_temp.bump('cccccccc-0000-0000-0000-000000000002', '2026-10-01', 10, pg_temp.t('2026-10-16 10:00:00')); -- 18: halfway, momentum, rally
select private.plan_notifications(pg_temp.t('2026-10-16 10:01:01'));
select is((select payload ->> 'key' from private.notification_jobs where kind = 'milestone' order by id desc limit 1), 'momentum',
  'one notification for the highest milestone crossed');
select is(pg_temp.jobs('rally'), 0::bigint, 'the rally crossed in the same batch is suppressed');
select results_eq(
  $$select key, status from private.notification_milestones
     where squad_id = 'bbbbbbbb-0000-0000-0000-000000000001' and month = '2026-10-01' order by threshold, key$$,
  $$values ('started', 'notified'), ('halfway', 'covered'), ('momentum', 'notified'), ('rally', 'covered')$$,
  'every crossed threshold is recorded once');
select is(private.close_activity_batch('bbbbbbbb-0000-0000-0000-000000000001', (select id from public.campaigns where slug = 'q4-2026'),
  '2026-10-01', true, pg_temp.t('2026-10-16 10:01:02')), 'none', 'a concurrent second planner finds nothing left to do');

select pg_temp.bump('cccccccc-0000-0000-0000-000000000003', '2026-10-01', 2, pg_temp.t('2026-10-16 11:00:00')); -- 20: cleared
select private.plan_notifications(pg_temp.t('2026-10-16 11:01:01'));
select is((select payload ->> 'key' from private.notification_jobs where kind = 'milestone' order by id desc limit 1), 'cleared', 'target hit');
select is(pg_temp.jobs('milestone'), 3::bigint, 'three milestone notifications in October (started, momentum, cleared)');
select pg_temp.bump('cccccccc-0000-0000-0000-000000000003', '2026-10-01', -1, pg_temp.t('2026-10-16 12:00:00'));
select pg_temp.bump('cccccccc-0000-0000-0000-000000000003', '2026-10-01', 1, pg_temp.t('2026-10-16 12:00:10'));
select private.plan_notifications(pg_temp.t('2026-10-16 12:02:00'));
select is(pg_temp.jobs('milestone'), 3::bigint, 'dipping below and recrossing never repeats a milestone');

-- -----------------------------------------------------------------------------
-- Weekly recap (Monday 09:00 SGT, previous Monday-Sunday)
-- -----------------------------------------------------------------------------
select private.plan_notifications(pg_temp.t('2026-10-19 08:59:59'));
select is((select count(*) from private.notification_jobs where kind = 'recap' and payload ->> 'week_start' = '2026-10-12'), 0::bigint, 'no recap before Monday 09:00');
select private.plan_notifications(pg_temp.t('2026-10-19 09:00:00'));
select is((select count(*) from private.notification_jobs where kind = 'recap' and payload ->> 'week_start' = '2026-10-12'), 1::bigint, 'recap at Monday 09:00');
select is((select payload - 'milestones' from private.notification_jobs where kind = 'recap' and payload ->> 'week_start' = '2026-10-12'),
  '{"net": 20, "week_start": "2026-10-12", "week_end": "2026-10-18", "month": "2026-10-01", "total": 20, "target": 20}'::jsonb,
  'recap covers Oct 12-18 with the net change from history');
select is((select payload -> 'milestones' from private.notification_jobs where kind = 'recap' and payload ->> 'week_start' = '2026-10-12'),
  '[{"key": "started", "month": "2026-10-01"}, {"key": "halfway", "month": "2026-10-01"}, {"key": "momentum", "month": "2026-10-01"}, {"key": "cleared", "month": "2026-10-01"}]'::jsonb,
  'recap lists the week''s milestones (no rally, no individuals)');
select private.plan_notifications(pg_temp.t('2026-10-19 09:05:00'));
select is((select count(*) from private.notification_jobs where kind = 'recap' and payload ->> 'week_start' = '2026-10-12'), 1::bigint, 'overlapping runs never send a second recap');
select private.plan_notifications(pg_temp.t('2026-10-26 09:00:00'));
select is((select status || ':' || reason from private.notification_jobs where kind = 'recap' and dedupe_key like 'recap:%' order by id desc limit 1),
  'cancelled:empty', 'an empty week sends nothing');

-- Month boundary: the week Oct 26-Nov 1 spans two campaign months.
select pg_temp.bump('cccccccc-0000-0000-0000-000000000003', '2026-10-01', 1, pg_temp.t('2026-10-31 15:00:00'));
select private.plan_notifications(pg_temp.t('2026-10-31 15:01:01'));
select pg_temp.bump('cccccccc-0000-0000-0000-000000000002', '2026-10-01', 1, pg_temp.t('2026-10-31 23:30:00'));   -- quiet, October
select pg_temp.bump('cccccccc-0000-0000-0000-000000000001', '2026-11-01', 23, pg_temp.t('2026-11-01 10:00:00'));  -- November target 30: momentum 23
select private.plan_notifications(pg_temp.t('2026-11-01 10:01:01'));
select ok(not exists (
  select 1 from private.notification_activity_items i join public.case_update_history h on h.id = i.history_id
  where h.changed_at = pg_temp.t('2026-10-31 23:30:00') and i.job_id is not null),
  'an update from a month that has closed is wrapped up without an activity alert');
select is((select payload ->> 'key' from private.notification_jobs where kind = 'milestone' and month = '2026-11-01'), 'momentum',
  'November momentum milestone');
select private.plan_notifications(pg_temp.t('2026-11-02 09:00:00'));
select is((select (payload ->> 'net')::int from private.notification_jobs where kind = 'recap' and dedupe_key like 'recap:%' order by id desc limit 1), 25,
  'recap across a month change adds both months'' history (1 + 1 + 23)');
select is((select payload ->> 'month' from private.notification_jobs where kind = 'recap' and dedupe_key like 'recap:%' order by id desc limit 1), '2026-11-01',
  'and reports the month that is open now');

-- -----------------------------------------------------------------------------
-- Rally (90% = 27 of 30) and suppression by a later milestone
-- -----------------------------------------------------------------------------
select pg_temp.bump('cccccccc-0000-0000-0000-000000000001', '2026-11-01', 4, pg_temp.t('2026-11-02 11:00:00'));  -- 27
select private.plan_notifications(pg_temp.t('2026-11-02 11:01:01'));
select is(pg_temp.jobs('rally'), 1::bigint, 'reaching 90% sends one rally');
select is((select priority from private.notification_jobs where kind = 'rally'), 0::smallint, 'rally is normal priority');
select pg_temp.bump('cccccccc-0000-0000-0000-000000000001', '2026-11-01', 1, pg_temp.t('2026-11-02 11:10:00'));  -- 28
select private.plan_notifications(pg_temp.t('2026-11-02 11:11:01'));
select is(pg_temp.jobs('rally'), 1::bigint, 'later updates never repeat the rally');
select pg_temp.bump('cccccccc-0000-0000-0000-000000000002', '2026-11-01', 2, pg_temp.t('2026-11-02 11:30:00'));   -- 30
select private.plan_notifications(pg_temp.t('2026-11-02 11:31:01'));
delete from private.notification_jobs where status = 'pending' and kind not in ('rally', 'milestone');
update private.notification_jobs set status = 'done' where kind = 'milestone' and month = '2026-10-01';
create temp table c8 as select * from private.claim_notifications(pg_temp.t('2026-11-02 11:31:05'), 10);
select is((select reason from private.notification_jobs where kind = 'rally'), 'covered',
  'a queued rally is dropped when a milestone already covers it');
select ok(not exists (select 1 from c8 where kind = 'rally'), 'the rally is not sent');
select is((select kind from c8 order by job_id desc limit 1), 'milestone', 'the cleared milestone is sent');
update private.notification_jobs set status = 'done', claim_token = null where status = 'claimed';

-- Missed recap (scheduler down all Monday): skipped, not sent a day late.
delete from private.notification_jobs where kind = 'recap' and payload ->> 'week_start' = '2026-10-26';
select private.plan_notifications(pg_temp.t('2026-11-03 10:00:00'));
select is((select reason from private.notification_jobs where kind = 'recap' and dedupe_key like 'recap:%' order by id desc limit 1), 'stale',
  'a recap more than a day late is skipped');

-- Lowered target: thresholds already met are recorded silently, never announced.
update public.monthly_targets set target_cases = 10 where month = '2026-12-01';
select pg_temp.bump('cccccccc-0000-0000-0000-000000000001', '2026-12-01', 9, pg_temp.t('2026-12-01 10:00:00'));
select private.plan_notifications(pg_temp.t('2026-12-01 10:01:01'));
select is((select payload ->> 'key' from private.notification_jobs where kind = 'milestone' and month = '2026-12-01'),
  'momentum', 'December (target 10): 9 cases = momentum');
update public.monthly_targets set target_cases = 8 where month = '2026-12-01';
select pg_temp.bump('cccccccc-0000-0000-0000-000000000001', '2026-12-01', 1, pg_temp.t('2026-12-01 10:05:00'));
select private.plan_notifications(pg_temp.t('2026-12-01 10:06:01'));
select is((select status from private.notification_milestones where month = '2026-12-01' and key = 'cleared'), 'silent',
  'after the target is lowered below the total, "cleared" is recorded silently');
select is((select count(*)::int from private.notification_jobs where kind = 'milestone' and month = '2026-12-01'), 1,
  'a target change never fires an old milestone');
update public.monthly_targets set target_cases = 40 where month = '2026-12-01';

-- -----------------------------------------------------------------------------
-- Check-in reminders (November; 72 h, +7 d, +7 d; cap 3; private routing)
-- -----------------------------------------------------------------------------
delete from private.notification_jobs where status in ('pending', 'claimed');
update public.push_subscriptions set squad_member_id = 'cccccccc-0000-0000-0000-000000000003', linked_at = '2026-10-20 10:00+08'
 where id = 'eeeeeeee-0000-0000-0000-000000000001';

select is(public.get_push_device_settings('https://fcm.googleapis.com/fcm/send/d1')::text,
  '(cccccccc-0000-0000-0000-000000000003,t,t,t,t)', 'device settings read back by endpoint');

select private.plan_notifications(pg_temp.t('2026-11-03 23:59:00'));
select is(pg_temp.jobs('reminder'), 0::bigint, 'no reminder before 72 hours');
select private.plan_notifications(pg_temp.t('2026-11-04 00:30:00'));
select is(pg_temp.jobs('reminder'), 2::bigint, 'after 72 hours: Ben and Daniel (linked, unconfirmed)');
select ok(not exists (select 1 from private.notification_jobs where kind = 'reminder' and squad_member_id = 'cccccccc-0000-0000-0000-000000000001'),
  'no reminder for a member whose phone turned reminders off');
select is((select min(scheduled_for) from private.notification_jobs where kind = 'reminder'), pg_temp.t('2026-11-04 08:00'),
  'a reminder due at night waits for 08:00');

select is((select status from private.confirm_checkin_at('cccccccc-0000-0000-0000-000000000003', 0, pg_temp.t('2026-11-04 01:00'))), 'confirmed', 'Daniel confirms zero');
select is((select confirmed_count from public.member_checkins where squad_member_id = 'cccccccc-0000-0000-0000-000000000003' and month = '2026-11-01'), 0,
  'confirmed zero is stored');
select is((select status || ':' || reason from private.notification_jobs where kind = 'reminder' and squad_member_id = 'cccccccc-0000-0000-0000-000000000003'),
  'cancelled:confirmed', 'confirming cancels the queued reminder');
select is((select status from private.confirm_checkin_at('cccccccc-0000-0000-0000-000000000002', 99, pg_temp.t('2026-11-04 01:00'))), 'conflict',
  'a confirmation must match the board');
select private.plan_notifications(pg_temp.t('2026-11-04 01:30:00'));
select is(pg_temp.jobs('reminder'), 2::bigint, 'nothing new while Ben''s first reminder is queued');

create temp table r1 as select * from private.claim_notifications(pg_temp.t('2026-11-04 08:00:05'), 10) where kind = 'reminder';
select is((select count(*)::int from r1), 1, 'one reminder is sent');
select is((select array_agg(r ->> 'id') from r1, jsonb_array_elements(recipients) r),
  array['eeeeeeee-0000-0000-0000-000000000002'], 'only to the phone linked to Ben');
select is((select payload ->> 'name' from r1), 'Ben', 'reminder payload is for that member only');
select private.complete_notification((select job_id from r1), (select claim_token from r1),
  jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000002', 'outcome', 'accepted', 'code', 201)),
  pg_temp.t('2026-11-04 08:00:05'));

select private.plan_notifications(pg_temp.t('2026-11-11 08:00:04'));
select is(pg_temp.jobs('reminder'), 2::bigint, 'the second reminder waits 7 days after the first was sent');
select private.plan_notifications(pg_temp.t('2026-11-11 08:00:06'));
select is(pg_temp.jobs('reminder'), 3::bigint, 'second reminder');
create temp table r2 as select * from private.claim_notifications(pg_temp.t('2026-11-11 08:01:00'), 10) where kind = 'reminder';
select private.complete_notification((select job_id from r2), (select claim_token from r2),
  jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000002', 'outcome', 'accepted', 'code', 201)),
  pg_temp.t('2026-11-11 08:01:00'));
select private.plan_notifications(pg_temp.t('2026-11-18 08:02:00'));
create temp table r3 as select * from private.claim_notifications(pg_temp.t('2026-11-18 08:02:30'), 10) where kind = 'reminder';
select private.complete_notification((select job_id from r3), (select claim_token from r3),
  jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-0000-0000-000000000002', 'outcome', 'accepted', 'code', 201)),
  pg_temp.t('2026-11-18 08:02:30'));
select private.plan_notifications(pg_temp.t('2026-11-26 09:00:00'));
select is((select count(*)::int from private.checkin_reminders where squad_member_id = 'cccccccc-0000-0000-0000-000000000002' and month = '2026-11-01'), 3,
  'never more than three reminders a month');
select throws_ok(
  $$insert into private.checkin_reminders (squad_member_id, campaign_id, month, seq, due_at)
    select 'cccccccc-0000-0000-0000-000000000002', id, '2026-11-01', 4, now() from public.campaigns where slug = 'q4-2026'$$,
  '23514', null, 'the cap is enforced by the database');
select throws_ok(
  $$insert into private.checkin_reminders (squad_member_id, campaign_id, month, seq, due_at)
    select 'cccccccc-0000-0000-0000-000000000002', id, '2026-11-01', 2, now() from public.campaigns where slug = 'q4-2026'$$,
  '23505', null, 'a reminder slot can only be used once');

-- Newly linked phone: waits the grace period; a stale queued reminder is dropped.
update public.push_subscriptions set pref_reminders = true, linked_at = pg_temp.t('2026-11-26 08:00')
 where id = 'eeeeeeee-0000-0000-0000-000000000003';
select private.plan_notifications(pg_temp.t('2026-11-26 09:00:00'));
select ok(not exists (select 1 from private.notification_jobs where kind = 'reminder' and squad_member_id = 'cccccccc-0000-0000-0000-000000000001'),
  'a phone linked minutes ago gets no instant reminder');
select private.plan_notifications(pg_temp.t('2026-11-26 20:01:00'));
select ok(exists (select 1 from private.notification_jobs where kind = 'reminder' and squad_member_id = 'cccccccc-0000-0000-0000-000000000001' and status = 'pending'),
  'after the grace period the reminder is queued');
select is((select count(*)::int from private.claim_notifications(pg_temp.t('2026-11-27 21:00:00'), 10) where kind = 'reminder'), 0,
  'a reminder still queued a day later is not sent');
select is((select reason from private.notification_jobs where kind = 'reminder' and squad_member_id = 'cccccccc-0000-0000-0000-000000000001'), 'stale', 'it is marked stale');

-- Unlinking stops routing.
set local role anon;
select lives_ok($$select public.set_push_device_member('https://web.push.apple.com/d2', null)$$, 'a phone can be unlinked');
select throws_ok($$select public.set_push_device_member('https://web.push.apple.com/unknown', null)$$, 'P0002', 'unknown device',
  'unknown phones cannot be changed');
select throws_ok($$select public.set_push_device_member('https://web.push.apple.com/d2', 'cccccccc-0000-0000-0000-00000000dead')$$,
  '42704', 'unknown squad member', 'only real members can be linked');
select lives_ok($$select public.set_push_device_prefs('https://web.push.apple.com/d2', true, true, false, false)$$, 'preferences can be set');
select throws_ok($$select public.set_push_device_prefs('https://web.push.apple.com/d2', true, null, false, false)$$, '22004', null,
  'preferences are validated');
reset role;
select is((select squad_member_id::text || pref_reminders::text from public.push_subscriptions where id = 'eeeeeeee-0000-0000-0000-000000000002'),
  null, 'unlinked (no member)');
select ok((select linked_at is null from public.push_subscriptions where id = 'eeeeeeee-0000-0000-0000-000000000002'), 'link time cleared');

-- Disabled category: recap off means no recap to that phone.
insert into private.notification_jobs (kind, dedupe_key, scheduled_for, payload, created_at)
values ('recap', 'test:prefs', pg_temp.t('2026-11-27 09:00'), '{}', pg_temp.t('2026-11-27 09:00'));
select ok(not exists (
  select 1 from private.claim_notifications(pg_temp.t('2026-11-27 09:00:01'), 10) c, jsonb_array_elements(c.recipients) r
  where c.kind = 'recap' and r ->> 'id' = 'eeeeeeee-0000-0000-0000-000000000002'), 'a disabled category is not sent to that phone');

-- -----------------------------------------------------------------------------
-- Cheers (anonymous, rate-limited)
-- -----------------------------------------------------------------------------
set local role anon;
select is((select status from public.send_cheer('lets_go', 'client-aaaaaaaaaaaaaaaa')), 'sent', 'a cheer is sent');
select is((select status from public.send_cheer('momentum', 'client-aaaaaaaaaaaaaaaa')), 'too_fast', 'rapid repeats are refused');
select is((select status from public.send_cheer('got_this', 'client-bbbbbbbbbbbbbbbb')), 'sent', 'another phone can cheer');
select throws_ok($$select * from public.send_cheer('you_lose', 'client-cccccccccccccccc')$$, '22023', 'unknown cheer', 'only preset cheers');
select throws_ok($$select * from public.send_cheer('lets_go', 'short')$$, '22023', 'bad client id', 'client id is validated');
select is((select count(*)::int from public.squad_cheers), 2, 'browsers can read recent cheers');
select is((select array_agg(column_name::text order by column_name::text) from information_schema.columns
            where table_schema = 'public' and table_name = 'squad_cheers'),
  array['cheer', 'created_at', 'id', 'squad_id'], 'cheers carry no member or device');
reset role;
update private.notify_policy set cheer_squad_per_minute = 2;
set local role anon;
select is((select status from public.send_cheer('one_squad', 'client-dddddddddddddddd')), 'busy', 'the squad-wide flood limit holds');
reset role;

select * from finish();
rollback;
