# Production notes (this squad's deployment)

Facts about the hosted deployment of **this** squad's app. Not part of the
starter template (`scripts/export-starter.mjs` leaves this file out). Never put
secret values here.

- App: https://cjo-squad-mission-pi.vercel.app (Vercel, `sin1`; every push to
  `main` deploys to production).
- Campaign seed: `supabase/migrations/20261002035215_campaign_q4_2026.sql`
  (`q4-2026`, Oct–Dec 2026, targets Oct 20 / Nov 30 / Dec 40, checked by
  `supabase/tests/database/06_campaign_seed.test.sql`). Notification reminders
  apply from `reminders_from` = 2026-11-01 (the `notify_policy` default).
- November PC$ challenge seed: `supabase/migrations/20261101090100_pc_challenge_nov_2026.sql`
  (`pc-nov-2026`: target $182,972 incl. growth, minimum $5,000, production
  1–30 Nov 2026, entries until 30 Nov 23:59:59 Singapore time; checked by
  `06_campaign_seed.test.sql`). Both PC$ migrations
  (`20261101090000_pc_challenge`, `20261101090100_pc_challenge_nov_2026`) are
  applied (SQL editor, 2026-11-01, comment-free paste; recorded in
  `supabase_migrations.schema_migrations`); live cards and Mission card verified.
- Policy values in `private.notify_policy` may have been tuned in the SQL editor;
  check the live row before copying values elsewhere.

## Supabase

Hosted project `tdmpukylkqgibfddedxi` (ap-southeast-1, Postgres 17): all
nine migrations are applied and recorded in
`supabase_migrations.schema_migrations` (the last two,
`member_weekly_momentum` and `realtime_case_counts`, via the SQL editor on
2026-10-03; Realtime confirmed "Live" on phones). Without
`squad_member_momentum` the per-member weekly list is hidden; without the
`supabase_realtime` publication, sync falls back to polling ("Auto-updating").
`20261007090000_push_notifications` (push devices) is applied too (SQL
editor, 2026-10-07) with one row in `private.push_settings` holding
`sha256(PUSH_SECRET)`. Push also needs the three push env vars in Vercel;
without them the card stays hidden. `20261014090000_notifications_v2` is
applied too (SQL editor, 2026-10-14), with the Supabase Cron job
`cjo-notify-every-minute` (pg_cron + pg_net, secret `cjo_cron_secret` in
Vault) and the same `CRON_SECRET` in Vercel. Health check: `net._http_response`
(scheduler calls, expect 200) and `private.notification_jobs`. Without the
migration the app falls back to the legacy direct alerts. Rotating `PUSH_SECRET` means updating
that row (`update private.push_settings set secret_hash = sha256(...)`).
`20261024090000_squad_recap` (one read-only function, no table or policy
change) is applied too (SQL editor, 2026-10-24; production recap verified
against the live October total). Undo: `drop function
public.squad_recap_history(uuid, uuid, timestamptz);`.
