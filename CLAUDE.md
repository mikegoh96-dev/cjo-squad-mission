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
featured); collective progress; team momentum (net cases today / this week, plus each
member's net this week listed A–Z, never ranked);
monthly milestones (first case, 50%, 75%, target) with a short celebration;
one big card per member (A–Z) on the dashboard with -/+ to update their
count for the open month. Mobile-first. Anything else (notifications, chat, profiles, points,
analytics, integrations) is out of scope.

## Access model: shared link, no login

One shared URL for the whole squad. No accounts, no sign-in anywhere.

- **Dashboard `/`** and **Mission `/mission`**: read-only squad progress.
  Data: `src/lib/data/dashboard.ts` -> pure maths in `src/lib/progress.ts` and
  `src/lib/mission.ts`. Contributions are listed alphabetically, never ranked.
- **Updating happens on the dashboard**: every member has a big card with this
  month's count and -/+ buttons (`src/components/squad/`). Taps update the
  card, hero, momentum and month card instantly (`LiveBoardProvider`,
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

**Security trade-off (accepted for a trusted internal team tool):** because
there is no authentication, the system **cannot prove who submitted a count**.
Anyone with the link can pick any name and change that member's current-month
total. Mitigations:
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
  elsewhere") so nothing is counted twice. Failed saves retry by themselves
  when the network returns (or via Retry);
- every real change is kept in the append-only `case_update_history`
  (`changed_by` is null: the submitter is unknown), so mistakes or misuse can be
  seen and corrected by an admin. If the link leaks outside the squad, treat it
  like any shared document link.

The `(dashboard)` route group holds `/` and `/mission` with their
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
| `src/lib/avatars.ts` | Avatar art per member, by display name: Mike and JY = man, Claire, Cynthia, Jamie, Jasmine = woman (unit-tested); add new members here. Art: `src/components/art/person.tsx` (shirt in the member's tint; hair `--avatar-hair`, lighter in dark mode) |
| `src/lib/initials.ts` | Avatar initials unique within the squad (fallback for members not in `avatars.ts`; unit-tested) |
| `src/app/(dashboard)/` | Dashboard (with member cards), Mission screen, `actions.ts` (`saveCaseCount`), loading skeleton, error state |
| `src/components/squad/` | `LiveBoardProvider`, `SquadBoard`, `MemberCard` (-/+, debounced conflict-safe saves, hype animation; the number sizes to the room between the buttons via container units; one column below 360px) |
| `src/components/live/live-sync.tsx` | Real-time sync (Realtime + polling fallback) and the Live badge |
| `src/lib/supabase/browser.ts` | Browser client for Realtime only (publishable key) |
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
gradient (`bg-brand`), bottom navigation (Squad · Mission). Status is always
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
  seven migrations are applied and recorded in
  `supabase_migrations.schema_migrations` (the last two,
  `member_weekly_momentum` and `realtime_case_counts`, via the SQL editor on
  2026-10-03; Realtime confirmed "Live" on phones). Without
  `squad_member_momentum` the per-member weekly list is hidden; without the
  `supabase_realtime` publication, sync falls back to polling ("Auto-updating").
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
`changed_by` null: shared-link submitters are unknown).

The squad total is **derived**, never stored (`squad_monthly_progress` view /
`computeSquadProgress`). Campaign targets are data (`monthly_targets`; seeded
Oct 2026 = 20, Nov = 30, Dec = 40). Never hard-code targets, months or years.
The open month is resolved in the campaign's `time_zone`.

## Permission model (RLS + grants)

| Role | Can | Cannot |
| --- | --- | --- |
| anon / authenticated | SELECT members, squads, squad_members, campaigns, monthly_targets, member_case_counts, squad_monthly_progress; call `submit_case_count(member, count, expected)`, `squad_momentum(squad)`, `squad_member_momentum(squad)`, `member_recent_updates(member, limit)` (currently unused by the UI) | INSERT/UPDATE/DELETE any table; read raw `case_update_history` |
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
