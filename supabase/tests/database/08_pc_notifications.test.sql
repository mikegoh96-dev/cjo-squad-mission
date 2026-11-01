-- PC$ push notifications on the existing outbox. Run with: npx supabase test db.
-- Fake clock (Singapore time) throughout; everything is rolled back.
--
-- Fixture: challenge target $20,000, minimum $5,000; squad Ben, Daniel,
-- Marcus. Phones: d1 all on, d2 all on (Ben's), d3 activity off (milestones on),
-- d4 everything off.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

delete from private.notification_jobs;
delete from public.push_subscriptions;
insert into public.campaigns (id, slug, name, starts_on, ends_on) values
  ('dddddddd-0000-0000-0000-0000000000a8', 'test-pcn', 'PC notify campaign', '2026-10-01', '2026-12-31');
insert into public.pc_challenges
  (id, campaign_id, slug, name, eligible_from, eligible_to, target_amount, member_minimum, opens_at, closes_at) values
  ('eeeeeeee-0000-0000-0000-0000000000a8', 'dddddddd-0000-0000-0000-0000000000a8', 'test-pcn', 'Test PC$ challenge',
   '2026-11-01', '2026-11-30', 20000, 5000, '2026-11-01 00:00+08', '2026-12-01 00:00+08');
insert into public.members (id, display_name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Ben'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'Daniel'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'Marcus');
insert into public.squads (id, name, created_at) values ('bbbbbbbb-0000-0000-0000-0000000000a8', 'PC notify squad', '1990-01-01');
insert into public.squad_members (id, squad_id, member_id) values
  ('cccccccc-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000a8', 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('cccccccc-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000a8', 'aaaaaaaa-0000-0000-0000-0000000000a2'),
  ('cccccccc-0000-0000-0000-0000000000a3', 'bbbbbbbb-0000-0000-0000-0000000000a8', 'aaaaaaaa-0000-0000-0000-0000000000a3');
insert into public.push_subscriptions (id, endpoint, p256dh, auth, squad_member_id, linked_at, pref_activity, pref_milestones, pref_reminders, pref_recap) values
  ('eeeeeeee-0000-0000-0000-0000000000d1', 'https://fcm.googleapis.com/fcm/send/pc1', 'BPkeyPkeyPkeyPkeyPkeyPkey01', 'authsecret01', null, null, true, true, true, true),
  ('eeeeeeee-0000-0000-0000-0000000000d2', 'https://web.push.apple.com/pc2', 'BPkeyPkeyPkeyPkeyPkeyPkey02', 'authsecret02', 'cccccccc-0000-0000-0000-0000000000a1', '2026-11-01 10:00+08', true, true, true, true),
  ('eeeeeeee-0000-0000-0000-0000000000d3', 'https://fcm.googleapis.com/fcm/send/pc3', 'BPkeyPkeyPkeyPkeyPkeyPkey03', 'authsecret03', null, null, false, true, true, true),
  ('eeeeeeee-0000-0000-0000-0000000000d4', 'https://fcm.googleapis.com/fcm/send/pc4', 'BPkeyPkeyPkeyPkeyPkeyPkey04', 'authsecret04', null, null, false, false, false, false);

create function pg_temp.t(p text) returns timestamptz language sql as $$ select (p::timestamp) at time zone 'Asia/Singapore' $$;
-- Save at a fake time: entries as 'member:amount:expected' (expected '-' = none yet).
create function pg_temp.save(p_at text, variadic p_entries text[])
returns setof text language sql as $$
  select r.status from private.submit_pc_amounts_at(
    'eeeeeeee-0000-0000-0000-0000000000a8',
    (select jsonb_agg(jsonb_build_object(
       'squad_member_id', 'cccccccc-0000-0000-0000-0000000000' || split_part(x, ':', 1),
       'amount', split_part(x, ':', 2)::bigint,
       'expected', nullif(split_part(x, ':', 3), '-')::bigint))
     from unnest(p_entries) x),
    pg_temp.t(p_at)) r
$$;
create function pg_temp.njobs() returns bigint language sql as $$
  select count(*) from private.notification_jobs where kind like 'pc_%' $$;
create function pg_temp.last() returns private.notification_jobs language sql as $$
  select * from private.notification_jobs where kind like 'pc_%' order by id desc limit 1 $$;
-- Claim everything due at a time and mark it delivered (so later saves start new jobs).
create function pg_temp.deliver(p_at text) returns jsonb language plpgsql as $$
declare r record; out jsonb := '[]';
begin
  for r in select * from private.claim_notifications(pg_temp.t(p_at), 50) loop
    out := out || jsonb_build_object('kind', r.kind, 'payload', r.payload,
      'phones', (select jsonb_agg(right(x ->> 'endpoint', 3) order by right(x ->> 'endpoint', 3)) from jsonb_array_elements(r.recipients) x));
    perform private.complete_notification(r.job_id, r.claim_token,
      (select jsonb_agg(jsonb_build_object('id', x ->> 'id', 'outcome', 'accepted', 'code', 201)) from jsonb_array_elements(r.recipients) x),
      pg_temp.t(p_at));
  end loop;
  return out;
end $$;

-- 1. Single member, first entry -------------------------------------------------------------
select is((select array_agg(s) from pg_temp.save('2026-11-10 12:00', 'a1:3000:-') s), array['saved'], 'Ben saves $3,000');
select is(pg_temp.njobs(), 1::bigint, 'one notification queued in the same transaction');
select is((pg_temp.last()).kind, 'pc_activity', 'an ordinary PC$ activity notification');
select is((pg_temp.last()).payload -> 'updates', '[{"id": "cccccccc-0000-0000-0000-0000000000a1", "name": "Ben", "old": null, "new": 3000}]'::jsonb,
  'names the member with the new cumulative amount (no previous amount)');
select is(((pg_temp.last()).payload ->> 'total')::bigint, 3000::bigint, 'squad total from saved amounts');
select is(((pg_temp.last()).payload ->> 'target')::bigint, 20000::bigint, 'the official target as stored');
select is((pg_temp.last()).scheduled_for, pg_temp.t('2026-11-10 12:00'), 'due straight away (outside quiet hours)');
select ok((pg_temp.last()).dedupe_key ~ '^pc:eeeeeeee-0000-0000-0000-0000000000a8:[0-9]+$', 'idempotency key per committed save');

select is(pg_temp.deliver('2026-11-10 12:00:30') -> 0 -> 'phones', '["pc1", "pc2"]'::jsonb,
  'every phone that wants squad activity, including the one that saved (Ben''s), and no others');

-- 2. Batch: one consolidated notification -----------------------------------------------------
select is((select count(*) from pg_temp.save('2026-11-10 13:00', 'a2:2000:-', 'a3:1000:-') s where s = 'saved'), 2::bigint, 'Daniel and Marcus saved together');
select is(pg_temp.njobs(), 2::bigint, 'one notification for the whole batch');
select is((select jsonb_agg(u ->> 'name') from jsonb_array_elements((pg_temp.last()).payload -> 'updates') u), '["Daniel", "Marcus"]'::jsonb,
  'it lists both members A-Z');
select is(((pg_temp.last()).payload ->> 'total')::bigint, 6000::bigint, 'with the new squad total');
select is(jsonb_array_length(pg_temp.deliver('2026-11-10 13:00:30')), 1, 'delivered as one notification');

-- 3. Retries, failures, conflicts, rollbacks: nothing extra ----------------------------------------
select is((select array_agg(s) from pg_temp.save('2026-11-10 13:01', 'a2:2000:-', 'a3:1000:-') s), array['unchanged', 'unchanged'],
  'a retry of the same save changes nothing');
select is(pg_temp.njobs(), 2::bigint, 'so it queues nothing');
select throws_ok($$select pg_temp.save('2026-11-10 13:02', 'a1:4000:3000', 'a2:-5:2000')$$, '23514', null, 'a save with an invalid amount fails');
select is(pg_temp.njobs(), 2::bigint, 'a failed save queues nothing (and saved nothing)');
select is((select amount from public.member_pc_amounts where squad_member_id = 'cccccccc-0000-0000-0000-0000000000a1'), 3000::bigint, 'Ben unchanged');
select is((select array_agg(s) from pg_temp.save('2026-11-10 13:03', 'a1:4000:1') s), array['conflict'], 'a stale screen gets a conflict');
select is(pg_temp.njobs(), 2::bigint, 'a conflict queues nothing');
savepoint before_rollback;
select pg_temp.save('2026-11-10 13:04', 'a1:4100:3000');
rollback to savepoint before_rollback;
select is(pg_temp.njobs(), 2::bigint, 'a rolled-back save leaves no notification');
select is(pg_temp.deliver('2026-11-10 13:05'), '[]'::jsonb, 'nothing to send');

-- 4. Correction ---------------------------------------------------------------------------------
select pg_temp.save('2026-11-10 14:00', 'a1:2500:3000');
select is((pg_temp.last()).payload -> 'updates' -> 0 -> 'old', '3000'::jsonb, 'a correction keeps the previous amount');
select is((pg_temp.last()).payload -> 'updates' -> 0 -> 'new', '2500'::jsonb, 'and the corrected amount');
select is(((pg_temp.last()).payload ->> 'total')::bigint, 5500::bigint, 'total recalculated with the corrected value');
select is((pg_temp.last()).kind, 'pc_activity', 'still ordinary activity');
select pg_temp.deliver('2026-11-10 14:00:30');

-- 5. Individual minimum ---------------------------------------------------------------------------
select pg_temp.save('2026-11-10 15:00', 'a1:6000:2500');
select is((pg_temp.last()).kind, 'pc_milestone', 'crossing $5,000 makes it a milestone notification');
select is((pg_temp.last()).payload -> 'minimum_reached', '["Ben"]'::jsonb, 'naming who reached the minimum');
select is((pg_temp.last()).priority, 1::smallint, 'milestones go first');
select is((select count(*)::int from private.pc_milestones where key = 'minimum' and squad_member_id = 'cccccccc-0000-0000-0000-0000000000a1'), 1, 'recorded once');
select is(pg_temp.deliver('2026-11-10 15:00:30') -> 0 -> 'phones', '["pc1", "pc2", "pc3"]'::jsonb,
  'milestones also reach the phone with activity off but milestones on');
select pg_temp.save('2026-11-10 15:10', 'a1:7000:6000');
select is((pg_temp.last()).kind, 'pc_activity', 'a further increase above the minimum is not announced again');
select pg_temp.save('2026-11-10 15:20', 'a1:4000:7000');
select pg_temp.save('2026-11-10 15:30', 'a1:5500:4000');
select is((pg_temp.last()).payload -> 'minimum_reached', '[]'::jsonb, 'policy: after a correction below, re-crossing is not announced again');
select is((pg_temp.last()).kind, 'pc_activity', '...it is an ordinary update');
select pg_temp.deliver('2026-11-10 15:31');

-- 6. Squad target ---------------------------------------------------------------------------------
select pg_temp.save('2026-11-10 16:00', 'a2:15000:2000');
select is(((pg_temp.last()).payload ->> 'total')::bigint, 21500::bigint, 'saved total 5,500 + 15,000 + 1,000');
select is(((pg_temp.last()).payload ->> 'target_reached')::boolean, true, 'reaching $20,000 announces the squad target');
select is((pg_temp.last()).payload -> 'minimum_reached', '["Daniel"]'::jsonb, 'Daniel''s minimum in the same notification');
select is(((pg_temp.last()).payload ->> 'everyone_minimum')::boolean, false, 'Marcus is below the minimum: not everyone qualified');
select is((select count(*)::int from pg_temp.deliver('2026-11-10 16:00:30') x), 1, 'one notification for both milestones');
select pg_temp.save('2026-11-10 16:10', 'a3:6000:1000');
select is(((pg_temp.last()).payload ->> 'target_reached')::boolean, false, 'the target is announced only once');
select is(((pg_temp.last()).payload ->> 'everyone_minimum')::boolean, true, 'now everyone has the minimum');
select pg_temp.save('2026-11-10 16:20', 'a2:9000:15000');
select pg_temp.save('2026-11-10 16:30', 'a2:15000:9000');
select is(((pg_temp.last()).payload ->> 'target_reached')::boolean, false, 'dropping below and re-crossing the target is not announced again');
select is((select count(*)::int from private.pc_milestones where key = 'target'), 1, 'one target record');
select pg_temp.deliver('2026-11-10 16:31');

-- 7. Quiet hours: queued for the morning, later saves merge -------------------------------------------
select pg_temp.save('2026-11-10 23:00', 'a1:8000:5500');
select is((pg_temp.last()).scheduled_for, pg_temp.t('2026-11-11 08:00'), 'a save during quiet hours waits until 8am');
select pg_temp.save('2026-11-10 23:30', 'a3:6500:6000');
select pg_temp.save('2026-11-11 02:00', 'a1:8200:8000');
select is((select count(*)::int from private.notification_jobs where kind like 'pc_%' and status = 'pending'), 1, 'later overnight saves join the same notification');
select is((select jsonb_agg(jsonb_build_array(u ->> 'name', u -> 'old', u -> 'new')) from jsonb_array_elements((pg_temp.last()).payload -> 'updates') u),
  '[["Ben", 5500, 8200], ["Marcus", 6000, 6500]]'::jsonb, 'one line per member: amount before the night -> latest');
select is(jsonb_array_length((pg_temp.last()).payload -> 'events'), 3, 'each committed save''s key is kept');
select is(pg_temp.deliver('2026-11-11 07:59'), '[]'::jsonb, 'nothing is sent during quiet hours');
select is(jsonb_array_length(pg_temp.deliver('2026-11-11 08:00')), 1, 'one notification at 8am (not stale: aged from 8am)');

-- 8. Case notifications unaffected ------------------------------------------------------------------
select is((select count(*)::int from private.notification_jobs where kind not like 'pc_%'), 0, 'PC$ saves never queue case notifications');
select is((select count(*)::int from public.member_case_counts where squad_member_id::text like 'cccccccc-0000-0000-0000-0000000000a%'), 0, 'or touch case counts');

select * from finish();
rollback;
