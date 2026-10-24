@AGENTS.md

# CJO Squad Mission

Collective squad progress app. **The squad succeeds together.** Members report
their monthly case count only to show their contribution to the shared squad
target. Never build individual rankings, leaderboards, member-vs-member or
squad-vs-squad comparisons. The primary metric is collective squad progress.

The database stores case **counts** only. Never store client names, NRIC,
policy numbers, premiums, medical, product or financial-planning data.

## Stack

Next.js 16 (App Router, `src/`), TypeScript, Tailwind CSS v4, Supabase
(Postgres only; **no Supabase Auth**), hosted on Vercel. Run `npm run check`
before pushing.

**Performance:** Vercel functions run in Singapore (`vercel.json`
`regions: ["sin1"]`), next to the database (ap-southeast-1). Keep database
calls parallel (the dashboard needs two round trips). Visited and prefetched
pages are reused for 30 s (`experimental.staleTimes`); bottom-nav links
prefetch, and `saveCaseCount` calls `revalidatePath("/", "layout")` so a save
shows everywhere immediately.

## V1 scope

Shared dashboard; October / November / December missions (current month
featured; the month-by-month cards are on the Mission screen only); collective progress; team momentum (net cases today / this week, plus each
member's net this week listed A–Z, never ranked);
monthly milestones (first case, 50%, 75%, target) with a short celebration;
one big card per member (A–Z) on the dashboard with -/+ to update their
count for the open month. Mobile-first. Push notifications (added 2026-10-07;
V2 on 2026-10-14 at the owner's request, see below): consolidated squad
activity, shared milestones + one rally, private monthly check-in reminders,
a Monday recap; an in-app cheer panel; a monthly check-in. A Squad Recap
and a downloadable monthly recap video for Instagram Stories (added
2026-10-24/25 at the owner's request, Mission page only; see below).
Anything else
(chat, profiles, points, analytics, integrations, WhatsApp posting) is out of
scope.

## Access model: shared link, no login

One shared URL for the whole squad. No accounts, no sign-in anywhere.

- **Dashboard `/`**, **Mission `/mission`** and **Settings `/settings`**
  (this phone's notification settings): read-only squad progress.
  Data: `src/lib/data/dashboard.ts` -> pure maths in `src/lib/progress.ts` and
  `src/lib/mission.ts`. Contributions are listed alphabetically, never ranked.
- **Updating happens on the dashboard**: every member has a big card with this
  month's count and -/+ buttons (`src/components/squad/`). Taps update the
  card, hero and momentum instantly (`LiveBoardProvider`,
  optimistic); after 600 ms without taps the card saves its new **total** once
  (`saveCaseCount` Server Action). + taps get a short hype animation (number
  pop, floating +1, burst, cheer); squad milestones trigger a celebration
  banner (dismiss with × or by swiping it left, right or up).
- **Real-time sync** (`src/components/live/live-sync.tsx`, mounted by
  `src/app/(dashboard)/layout.tsx`): a browser Supabase client
  (`src/lib/supabase/browser.ts`, publishable key, Realtime only) listens for
  `postgres_changes` on `member_case_counts` and `squad_members` and calls
  `router.refresh()` (debounced 400 ms). Safety net: refresh every 15 s while
  visible (60 s when Realtime is connected), on focus/visibility and when the
  network returns. Cards with unsaved taps keep their value; a teammate's
  increase flashes their card ("+n", "Just added!"). The header shows "Live"
  (Realtime subscribed) or "Auto-updating" (polling).
  Counts belong to the open month, so every card starts at 0 when a new
  mission month begins. There is no separate update page.
- **Push notifications V2** (installable web app + Web Push, no third party).
  The DATABASE decides what is sent, when and to whom; the app only renders
  and delivers. Migration `20261014090000_notifications_v2.sql`:
  - **Outbox** `private.notification_jobs` (unique `dedupe_key` per logical
    notification, priority 1 = milestone, `scheduled_for`, attempts, lease) and
    `private.notification_deliveries` (one row per phone per job; push host
    only, never the endpoint). Policy in ONE row: `private.notify_policy`
    (quiet hours 22:00–08:00 Asia/Singapore, 60 s window, rally 90%, reminder
    72 h / +7 d / cap 3, recap Mon 09:00, retries 5, cheers limits).
  - **Planner** `notify_plan(secret)` (advisory-locked): committed history rows
    become activity batches once the window since the first update has passed
    (never during quiet hours, so overnight = one morning alert). Each history
    row belongs to exactly one batch (`notification_activity_items`, a row-id
    set, not a cursor). Milestones (first case, 50%, 75%, target) + rally (90%)
    are recorded once per month in `notification_milestones` from authoritative
    totals; one batch crossing several sends only the highest milestone (rally
    suppressed); thresholds already met before a batch (lowered target) are
    recorded silently. Reminders: one slot at a time in `checkin_reminders`
    (PK + `seq between 1 and 3`), only to phones linked to that member, from
    `reminders_from` (2026-11-01), never planned into the next month. Recap:
    previous Mon–Sun net change from history + milestones; empty or >24 h late
    = cancelled.
  - **Claim / complete** `notify_claim(secret, n)` (`for update skip locked`,
    re-checks staleness, confirmation, rally coverage, recipients by category
    preference; nothing during quiet hours) and `notify_complete(...)`
    (accepted / gone 404-410 = device removed / retry 429-5xx-network with
    backoff 1, 5, 15, 60 min and never into quiet hours / rejected = not
    retried). A late report from an expired claim is ignored.
  - **Sender**: `/api/notify/run` (Bearer `CRON_SECRET`, timing-safe; closed if
    unset) -> `runNotifications()` in `src/lib/push/server.ts` -> `runJobs` +
    wording `renderJob` + `classifyPushError` in `src/lib/push/jobs.ts`
    (unit-tested; contributors named A–Z, never their totals). Called every
    minute by **Supabase Cron** (pg_cron + pg_net; secret in Vault) and after
    each adding save (`notifyAfterSave` via `after()`). The phone that tapped
    gets alerts too. If the V2 functions are missing (`PGRST202`), the legacy
    direct send (`notifyCasesAdded`, `message.ts`, `deliver.ts`) runs instead.
  - **Opt-in** stays as before (`notifications-card.tsx`, `register_push_device`,
    welcome push). The Squad page shows only the "Turn on" prompt (and a short
    confirmation linking to Settings right after opting in). The **Settings**
    tab (`/settings`, `src/app/(dashboard)/settings/page.tsx`; bottom nav
    Squad · Mission · Settings) holds `NotificationsCard place="settings"`:
    status, Turn off and four category toggles (`set_push_device_prefs`), plus
    a "How squad alerts work" card. `public/sw.js` shows
    `{title, body, tag, url}` and opens the url (milestones/rally/recap
    `/mission`, reminders `/?checkin=1`).
  - **Check-in** (`src/components/checkin/checkin-card.tsx`, `member_checkins`):
    "Which card is yours?" is remembered on the phone (`src/lib/me.ts`,
    localStorage) and synced to the phone's subscription
    (`set_push_device_member`) for reminder routing; it is NOT identity. Only
    that member's card shows "You" and the Check in control ("Confirm 0 cases"
    works); `confirm_checkin` must match the stored count and cancels queued
    reminders. There is no list of who has or hasn't checked in.
  - **Cheers** (`src/components/cheers/cheer-panel.tsx`, `send_cheer`,
    `public.squad_cheers`): 4 presets, anonymous (no member/device stored),
    rate-limited (per browser hash + squad-wide), never pushed, kept 2 days,
    live via Realtime (polling every 8 s as fallback).
  Manifest `src/app/manifest.ts`, icons in `public/` + `src/app/apple-icon.png`.
  Without the push env vars the card is hidden and nothing is sent.
- **Launch splash** (`src/components/splash-screen.tsx`, CSS "Splash" in
  `globals.css`, mounted in the root layout): server-rendered, so it paints
  with the first HTML and animates with CSS before any JavaScript. The logo is
  the app icon's real layers (ray tile + `Trophy3D`). The bar follows
  observable stages only (page arrived -> app code running -> squad data on
  screen, i.e. `main` without `[data-testid=loading-state]` -> fonts, max 0.5 s) and
  reaches 100% only once the data is on screen; at least 2 s from navigation
  start (owner asked for a slower, more visible splash), then a 0.5 s fade. Runs once per full load (launch, reload, app
  update), never on tab navigation. Data error -> it steps aside for
  `error.tsx` (Try again) without reaching 100%. After 12 s a plain-form
  "Try again" appears (works without JS); `<noscript>` hides it. Reduced
  motion: fades only. The OS's own launch screen (before the web app starts)
  is separate and not controlled by the app.
- **Squad Recap** (Mission page only; `src/components/recap/`): the "Squad
  Recap" card -> "Generate Recap" -> pick Weekly (this week / last week) or
  Monthly (each campaign month that has started), with the exact period shown
  -> a ~22 s animated story (opening, squad performance, milestones, thank-you
  to the whole squad A–Z, next mission) with pause, back/next, skip to summary,
  close (× / Escape) -> a summary card (Replay, Back to Mission, Share or Copy
  summary: only what the browser supports). Periods are whole days in the
  campaign time zone, end exclusive: week = Monday 00:00 -> next Monday 00:00,
  month = 1st -> next 1st. Maths in `src/lib/recap.ts` (pure, unit-tested):
  cases = net of the recorded changes inside the period (never the current
  total), progress = the month total replayed to the period's end, teammates =
  members whose count rose overall in the period (a count only, no names or
  numbers per person), milestones = first time each was reached (re-crossing
  after a correction never counts again; thresholds use the current target).
  If the recorded history doesn't add up to the stored totals, the recap
  refuses ("Not enough history") rather than guess. Data: the anon function
  `squad_recap_history(squad, campaign, until)` (migration
  `20261024090000_squad_recap.sql`; read from the browser in
  `src/lib/recap-client.ts`) + `member_case_counts`. Without the function the
  card says "Recap isn't available yet". Reduced motion: no movement.
- **Monthly recap video** (Mission page, "Download Monthly Recap";
  `src/components/recap/monthly-video.tsx`): pick a started campaign month
  (months whose history doesn't add up are shown as "not enough history"),
  preview, Generate Video, then Download Video / Share (file share, when the
  browser supports it) / Preview Again / Close. Made entirely on the phone:
  `video/composition.tsx` draws a dedicated 1080 × 1920 composition on a
  canvas (5 scenes, 20.6 s, the Mission page look + the 3D art rasterised from
  `components/art`), `video/encode.ts` encodes every frame as H.264 with
  WebCodecs and muxes MP4 with **Mediabunny** (pinned 1.61.3, MPL-2.0,
  dynamic import: only loaded when the dialog opens). Output is fixed in
  `src/lib/recap-video.ts` (`VIDEO`: 1080 × 1920, 30 fps, 618 frames, no
  audio, ~7 Mbit/s); the report is built there from `computeRecap` (no second
  calculation), and one snapshot per month feeds both the preview and the file.
  Progress = frames encoded; one job at a time; Cancel / Close stops it and
  closes the encoder. No H.264 encoder (e.g. Firefox, open-source Chromium) ->
  "Create image (PNG)" of the closing frame, labelled as a still image. Nothing
  is uploaded or stored; no server rendering. File:
  `CJO-Squad-Recap-<Month>-<Year>.mp4` / `.png`.
- **App updates** (Home Screen apps resume old copies and have no reload or
  pull-to-refresh): `next.config.ts` stamps each build with `APP_VERSION`
  (Vercel deployment id); `/api/version` returns the live one (no-store).
  `UpdateWatcher` (`src/components/app-update.tsx`, in the dashboard layout)
  checks on reopen (visibility/pageshow) and every 5 min: on reopen with a new
  version it reloads at once (once per version, never while a card has taps
  pending/saving/unsaved: `setUnsaved` in `src/lib/app-version.ts`); otherwise
  it shows a "New version ready · Update" banner. `UpdateButton` ("Check for
  updates" + version) sits at the bottom of every screen (`AppShell`). Nobody
  needs to re-add the app to the Home Screen after a deploy.

**Security trade-off (accepted for a trusted internal team tool):** because
there is no authentication, the system **cannot prove who submitted a count**.
Anyone with the link can pick any name and change that member's current-month
total, confirm that member's check-in, or link a phone to them (reminder
routing only; a phone link is never proof of who holds it). Mitigations:
- the only write path is `submit_case_count(member, count, expected)`; no table
  is writable by the browser roles;
- only existing squad members, only the open month (campaign time zone), only
  whole numbers 0–1000;
- saves are conflict-safe: a card sends the last total it confirmed; the
  function locks the member row and returns `saved`, `unchanged` (retries
  never inflate) or `conflict` (nothing written). On a conflict the card adds
  its unsaved taps on top of the newer total and saves again ("+n added
  elsewhere"; `rebaseTaps` in `board.ts`), unless an earlier save's outcome is
  unknown (request failed): then it shows the stored total ("Updated
  elsewhere") so nothing is counted twice. An `unchanged` reply to a save that
  expected a different total (two phones tapped +1 from the same count) is
  handled the same way: someone else saved that total, so the taps go on top.
  Failed saves retry by themselves when the network returns (or via Retry);
- every real change is kept in the append-only `case_update_history`
  (`changed_by` is null: the submitter is unknown), so mistakes or misuse can be
  seen and corrected by an admin. If the link leaks outside the squad, treat it
  like any shared document link.

The `(dashboard)` route group holds `/`, `/mission` and `/settings` with their
`loading.tsx` and `error.tsx` (retry without reload).

| File | Use |
| --- | --- |
| `src/lib/supabase/server.ts` | Server-only Supabase client (publishable key, no session) |
| `src/lib/supabase/env.ts` | Reads and validates env vars |
| `src/lib/supabase/database.types.ts` | **Generated** DB types (`npm run db:types`); never edit by hand |
| `src/lib/data/dashboard.ts` | Dashboard data (V1: the oldest squad, current campaign) + momentum (squad and per member; per-member is optional and hidden if unavailable) |
| `src/lib/data/case-updates.ts` | `submitCaseCount` (the only write) |
| `src/lib/board.ts` | Tap clamping, cheers, optimistic totals (unit-tested) |
| `src/lib/mission.ts` | Pure mission maths: progress %, status, milestones, celebration, momentum, messages (unit-tested) |
| `src/lib/progress.ts` | Campaign/month phases, focus month, month filtering, contributions (unit-tested) |
| `src/lib/avatars.ts` | Avatar art per member, by display name: Mike and JY = man, Claire, Cynthia, Jamie, Jasmine = woman (unit-tested); add new members here. Art: `src/components/art/person.tsx`, original stylised 3D-cartoon busts (materials `art-av-*` in `art-defs.tsx`; top in the member's tint; 44px on member cards, 32px in momentum) |
| `src/lib/initials.ts` | Avatar initials unique within the squad (fallback for members not in `avatars.ts`; unit-tested) |
| `src/app/(dashboard)/` | Dashboard (with member cards), Mission screen, `actions.ts` (`saveCaseCount`), loading skeleton, error state |
| `src/components/squad/` | `LiveBoardProvider`, `SquadBoard`, `MemberCard` (-/+, debounced conflict-safe saves, hype animation; the number sizes to the room between the buttons via container units; one column below 360px) |
| `src/components/live/live-sync.tsx` | Real-time sync (Realtime + polling fallback) and the Live badge |
| `src/lib/supabase/browser.ts` | Browser client for Realtime only (publishable key) |
| `src/lib/push/` | `jobs.ts` (V2 wording, error classes, runner), `message.ts` + `deliver.ts` (legacy direct send), `endpoint.ts` (allowed push hosts) — unit-tested; `server.ts` (server-only: config, web-push, `runNotifications`, `notifyAfterSave`, legacy `notifyCasesAdded`, `sendWelcome`); `client.ts` (support check, SW registration, VAPID key); `policy.ts` (quiet-hours label for the UI) |
| `src/app/api/notify/run/route.ts` | Scheduler endpoint (Bearer `CRON_SECRET`) |
| `src/app/(dashboard)/squad-actions.ts` | Check-in, phone link/preferences, cheers (Server Actions) |
| `src/lib/me.ts`, `src/lib/cheers.ts` | This phone's member (localStorage store); cheer keys |
| `src/lib/recap.ts`, `src/lib/recap-client.ts`, `src/components/recap/` | Squad Recap: periods + metrics (unit-tested), browser read, entry card / picker / player / summary |
| `src/lib/recap-video.ts`, `src/components/recap/monthly-video.tsx`, `src/components/recap/video/` | Monthly recap video: report + timeline (unit-tested), export dialog, canvas composition, MP4 encoder / PNG fallback |
| `src/lib/app-version.ts`, `src/components/app-update.tsx`, `src/app/api/version/route.ts` | Self-update for Home Screen apps (see "App updates") |
| `src/components/` | `ui.tsx` (Card, Meter, Ring, Avatar), icons, `app-shell`, `nav/bottom-nav`, `mission/*` |
| `scripts/members.mjs` | Admin CLI: list / add / rename / remove members |

The app never uses a service-role/secret key; all browser-facing code paths
can do only what the `anon` role can do. Realtime respects RLS: browsers only
receive rows the anon role may read (these tables are public-read anyway).

## Design

Premium 3D mobile-game look, collective and non-competitive. Tokens live in
`src/app/globals.css` (light + dark): colours, radii (`--radius-card/tile/btn`),
depth (`--shadow-card`, `--shadow-tile`: inner top highlight + thick bottom
"lip" + soft drop), physical buttons (`.btn-3d` + `.btn-3d-brand` /
`.btn-3d-soft`: raised on a lip, press down 2px), glossy avatar `.orb`,
`.sparkle` particles, faint background rays, and motion (`--ease-spring`;
`animate-float`, `animate-unlock`, `.shine`, number pop, +1 float, burst,
card glow, confetti). Everything decorative is off under
`prefers-reduced-motion`. Plus Jakarta Sans, bold numbers, blue -> violet brand
gradient (`bg-brand`), bottom navigation (Squad · Mission · Settings). Status is always
icon + label; green = complete only.

**Corners:** one radius scale only: `rounded-card` (28px: page cards, hero,
nav, banners), `rounded-tile` (24px: tiles inside cards, member cards,
milestones), `rounded-btn` (16px), `rounded-full` (pills). The runtime values
are `--r-card/tile/btn` on `:root` (`@theme inline` values are not runtime
variables). Glows, rays and shine go inside `<Decor>` (`ui.tsx`; parent
`relative isolate`), which clips with `clip-path` because iOS Safari lets
animated/blurred children escape `overflow-hidden` + radius. Never use blur
filters inside rounded cards; use radial gradients.

**3D achievement objects** (`src/components/art/`): original inline-SVG assets
(Trophy, Medal, Crown, Rocket, Star, Bolt, Flame, Gem) built on one system:
shared materials in `art-defs.tsx` (rendered once in the root layout), key light
top-left, an offset depth layer for thickness, a glossy highlight, a soft cast
shadow. `muted` = the locked look (soft lavender, dimmed in dark mode). Use
these for achievement visuals; keep flat icons for UI controls. Mapping:
milestones started/halfway/momentum/cleared = Star/Medal/Bolt/Trophy; mission
months by position = Trophy/Rocket/Crown (not by month name); momentum =
Flame; squad total = Gem; hero = floating Trophy breaking out of the card.

Headline copy is collective ("We're 3 cases away"), never individual. No
rankings, coins, XP or badges beyond the four monthly squad milestones.

## Admin: members

Admin CLI (needs `SUPABASE_SECRET_KEY` in `.env.local`; never `NEXT_PUBLIC_`,
never on Vercel, never committed):

```bash
npm run members -- add "<squad name>" "<member name>"   # prints squad_member_id
npm run members -- list
npm run members -- rename <squad_member_id> "<new name>"
npm run members -- remove <squad_member_id>   # also deletes their counts + history
```

To correct a count, tap - on that member's card, or use the SQL editor.

## Environment variables

Copy `.env.example` to `.env.local` (git-ignored).

| Variable | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | App (local + Vercel Production/Preview) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | App (local + Vercel Production/Preview) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push: public VAPID key (Vercel Production/Preview) |
| `VAPID_PRIVATE_KEY` | Push: signs messages. Server only (Vercel), never `NEXT_PUBLIC_`, never committed |
| `PUSH_SECRET` | Push: lets the server list devices and plan/claim/complete jobs; its SHA-256 is in `private.push_settings`. Server only, never committed |
| `CRON_SECRET` | Scheduler: Supabase Cron sends it as `Authorization: Bearer …` to `/api/notify/run`; the same value lives in Supabase Vault (`cjo_cron_secret`). Server only, 32+ chars, never committed |
| `VAPID_SUBJECT` | Optional contact URL for push services (defaults to the Vercel production URL) |
| `SUPABASE_SECRET_KEY` | Admin CLI only, on an admin's machine |

`NEXT_PUBLIC_` values are inlined at build time; redeploy after changing them.

## Database and migrations

- Schema lives only in `supabase/migrations/` (Supabase CLI). Never create
  tables in the dashboard. New change: `npx supabase migration new <name>`.
- Every new table needs, **in the same migration**: `enable row level security`,
  policies, and explicit grants. Supabase's automatic grants are revoked, so
  new objects are private until granted.
- Apply to the hosted project: `npx supabase login`, `npx supabase link
  --project-ref <ref>`, then `npx supabase db push`.
- Hosted project `tdmpukylkqgibfddedxi` (ap-southeast-1, Postgres 17): all
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
- Types were last generated with `@supabase/postgres-meta` against the migrated
  local database (`PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true`,
  `PG_META_POSTGREST_VERSION=14.18`), byte-identical to the hosted generator.
- Tests: `supabase/tests/database/*.test.sql` (pgTAP), run with
  `npm run db:test` (needs `npx supabase start`, Docker).
- After any migration, regenerate types (`npm run db:types`) and commit them.

Tables: `members`, `squads`, `squad_members` (one squad per member),
`campaigns` (with `time_zone`), `monthly_targets` (squad target per campaign
month), `member_case_counts` (a member's **current** monthly total, integer
0–1000), `case_update_history` (append-only audit, written by trigger;
`changed_by` null: shared-link submitters are unknown), `push_subscriptions`
(anonymous opted-in devices: endpoint + keys; private, function access only;
endpoints must be a known browser push service; optional `squad_member_id`
link + four `pref_*` flags), `member_checkins` (private; confirmed count per
member per month, zero allowed), `squad_cheers` (public-read for 1 day,
written only by `send_cheer`). Notification internals live in `private`
(`notify_policy`, `notification_jobs`, `notification_deliveries`,
`notification_activity_items`, `notification_milestones`, `checkin_reminders`,
`cheer_log`).

The squad total is **derived**, never stored (`squad_monthly_progress` view /
`computeSquadProgress`). Campaign targets are data (`monthly_targets`; seeded
Oct 2026 = 20, Nov = 30, Dec = 40). Never hard-code targets, months or years.
The open month is resolved in the campaign's `time_zone`.

## Permission model (RLS + grants)

| Role | Can | Cannot |
| --- | --- | --- |
| anon / authenticated | SELECT members, squads, squad_members, campaigns, monthly_targets, member_case_counts, squad_monthly_progress; call `submit_case_count(member, count, expected)`, `squad_momentum(squad)`, `squad_member_momentum(squad)`, `member_recent_updates(member, limit)` (currently unused by the UI), `squad_recap_history(squad, campaign, until)` (the squad's recorded changes: time, month, net change, squad member; counts only), `register_push_device` / `unregister_push_device`, `get_push_device_settings` / `set_push_device_member` / `set_push_device_prefs` (by endpoint), `confirm_checkin` / `get_checkin` (one member), `send_cheer`; SELECT recent `squad_cheers` | INSERT/UPDATE/DELETE any table; read raw `case_update_history` or `member_checkins`; list push devices or touch the outbox (`push_devices`, `forget_push_devices`, `notify_plan`, `notify_claim`, `notify_complete` need `PUSH_SECRET`) |
| service_role (admin CLI) | manage squads, members and counts | — |

The functions are `security definer` with `search_path = ''`; private helpers
live in the unexposed `private` schema. Supabase Auth is unused
(email sign-ups disabled on the hosted project).

## Local development

```bash
npm ci
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev
```
