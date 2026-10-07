-- Push notification devices. Run with: npx supabase test db
-- Browsers may only register/remove a device; listing needs the server secret.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Fixture (rolled back): the server secret and a clean device list.
delete from private.push_settings;
delete from public.push_subscriptions;
insert into private.push_settings (secret_hash)
values (sha256(convert_to('test-secret-0123456789abcdef0123456789', 'UTF8')));

-- Schema and privileges --------------------------------------------------------
select has_table('public', 'push_subscriptions', 'push_subscriptions exists');
select ok((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass), 'RLS is on');
select is((select count(*)::int from pg_policies where tablename = 'push_subscriptions'), 0, 'no policies: private table');
select ok(not has_table_privilege('anon', 'public.push_subscriptions', 'select'), 'anon cannot read devices');
select ok(not has_table_privilege('anon', 'public.push_subscriptions', 'insert'), 'anon cannot insert devices');
select ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'select'), 'authenticated cannot read devices');
select ok(not has_table_privilege('anon', 'private.push_settings', 'select'), 'anon cannot read the secret hash');
select ok(has_function_privilege('anon', 'public.register_push_device(text, text, text)', 'execute'), 'anon can register');
select ok(has_function_privilege('anon', 'public.unregister_push_device(text)', 'execute'), 'anon can unregister');

-- As a browser ----------------------------------------------------------------
set local role anon;

select lives_ok(
  $$select public.register_push_device('https://fcm.googleapis.com/fcm/send/abc123', 'BPkeyPkeyPkeyPkeyPkeyPkey01', 'authsecret01')$$,
  'a Chrome/Android device registers'
);
select lives_ok(
  $$select public.register_push_device('https://web.push.apple.com/QGx-apple-token', 'BPkeyPkeyPkeyPkeyPkeyPkey02', 'authsecret02')$$,
  'an iPhone device registers'
);
select lives_ok(
  $$select public.register_push_device('https://fcm.googleapis.com/fcm/send/abc123', 'BPkeyPkeyPkeyPkeyPkeyPkey03', 'authsecret03')$$,
  'registering again refreshes the same device'
);
select throws_ok(
  $$select public.register_push_device('https://evil.example.com/collect', 'BPkeyPkeyPkeyPkeyPkeyPkey04', 'authsecret04')$$,
  '22023', 'unsupported push endpoint', 'unknown hosts are rejected (no arbitrary URLs)'
);
select throws_ok(
  $$select public.register_push_device('http://fcm.googleapis.com/fcm/send/x', 'BPkeyPkeyPkeyPkeyPkeyPkey05', 'authsecret05')$$,
  '22023', 'unsupported push endpoint', 'plain http is rejected'
);
select throws_ok(
  $$select public.register_push_device('https://fcm.googleapis.com/fcm/send/y', 'short', 'authsecret06')$$,
  '23514', null, 'malformed keys are rejected'
);
select throws_ok($$select count(*) from public.push_subscriptions$$, '42501', null, 'browsers cannot list devices');
select throws_ok($$select * from public.push_devices('wrong')$$, '42501', 'not allowed', 'listing without the secret fails');
select throws_ok(
  $$select * from public.push_devices('test-secret-0123456789abcdef0123456789x')$$,
  '42501', 'not allowed', 'a near-miss secret fails'
);

-- As the app server (anon role + secret) ---------------------------------------
select set_eq(
  $$select endpoint, p256dh from public.push_devices('test-secret-0123456789abcdef0123456789')$$,
  $$values ('https://fcm.googleapis.com/fcm/send/abc123'::text, 'BPkeyPkeyPkeyPkeyPkeyPkey03'::text),
           ('https://web.push.apple.com/QGx-apple-token'::text, 'BPkeyPkeyPkeyPkeyPkeyPkey02'::text)$$,
  'the server lists both devices, with refreshed keys'
);
select is(
  public.forget_push_devices('test-secret-0123456789abcdef0123456789', array['https://web.push.apple.com/QGx-apple-token']),
  1, 'gone devices are dropped'
);
select throws_ok(
  $$select public.forget_push_devices('nope', array['https://fcm.googleapis.com/fcm/send/abc123'])$$,
  '42501', 'not allowed', 'dropping devices needs the secret'
);
select lives_ok(
  $$select public.unregister_push_device('https://fcm.googleapis.com/fcm/send/abc123')$$,
  'a browser turns its notifications off'
);
select is(
  (select count(*)::int from public.push_devices('test-secret-0123456789abcdef0123456789')),
  0, 'no devices left'
);
reset role;

-- Without a configured secret nobody can list devices.
delete from private.push_settings;
set local role anon;
select throws_ok(
  $$select * from public.push_devices('test-secret-0123456789abcdef0123456789')$$,
  '42501', 'not allowed', 'no secret configured: listing is closed'
);
reset role;

select * from finish();
rollback;
