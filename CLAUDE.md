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
featured); collective progress; team momentum (net cases today / this week);
monthly milestones (first case, 50%, 75%, target) with a short celebration;
case entry by name for the open month; member list (A–Z); each member's recent
updates. Mobile-first. Anything else (notifications, chat, profiles, points,
analytics, integrations) is out of scope.

## Access model: shared link, no login

One shared URL for the whole squad. No accounts, no sign-in anywhere.

- **Dashboard `/`** and **Mission `/mission`**: read-only squad progress.
  Data: `src/lib/data/dashboard.ts` -> pure maths in `src/lib/progress.ts` and
  `src/lib/mission.ts`. Contributions are listed alphabetically, never ranked.
- **Update `/update`**: pick your name, then set your **total** for the open
  month (never an increment). `?member=<squad_member_id>` selects a member; the
  member a device last saved for is remembered in an httpOnly cookie
  (`cjo_member`, `src/lib/remembered-member.ts`). "Not you?" clears it.

**Security trade-off (accepted for a trusted internal team tool):** because
there is no authentication, the system **cannot prove who submitted a count**.
Anyone with the link can pick any name and change that member's current-month
total. Mitigations:
- the only write path is `submit_case_count(member, count, expected)`; no table
  is writable by the browser roles;
- only existing squad members, only the open month (campaign time zone), only
  whole numbers 0–1000;
- saves are conflict-safe: the screen sends the count it displayed; the
  function locks the member row and returns `saved`, `unchanged` (double taps
  and retries never inflate) or `conflict` (nothing written; the UI offers
  "Keep X / Save Y anyway");
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
| `src/lib/data/dashboard.ts` | Dashboard data (V1: the oldest squad, current campaign) + momentum |
| `src/lib/data/case-updates.ts` | `submitCaseCount`, `getRecentUpdates`, `getSquadMonthForMember` |
| `src/lib/mission.ts` | Pure mission maths: progress %, status, milestones, celebration, momentum, messages (unit-tested) |
| `src/lib/progress.ts` | Campaign/month phases, focus month, month filtering, contributions (unit-tested) |
| `src/lib/initials.ts` | Avatar initials unique within the squad (Jamie JM, Jasmine JS; unit-tested) |
| `src/lib/remembered-member.ts` | Remembered-member cookie (convenience, not a credential) |
| `src/app/(dashboard)/` | Dashboard, Mission screen, loading skeleton, error state |
| `src/app/update/` | Name picker + `update-screen.tsx`, `actions.ts` (`saveCaseCount`, `switchMember`) |
| `src/components/` | `ui.tsx` (Card, Meter, Ring, Avatar), icons, `app-shell`, `nav/bottom-nav`, `mission/*` |
| `scripts/members.mjs` | Admin CLI: list / add / rename / remove members |

The app never uses a service-role/secret key; all browser-facing code paths
can do only what the `anon` role can do.

## Design

Mobile-first, iOS-inspired: rounded cards, big numbers, blue -> violet brand
gradient (`bg-brand`), Plus Jakarta Sans, bottom navigation (Squad · Update ·
Mission). Tokens live in `src/app/globals.css` (light + dark). Status is always
icon + label; green = complete only. Motion is subtle and off under
`prefers-reduced-motion` (confetti hidden). Headline copy is collective ("We're
3 cases away"), never individual. No rankings, coins, XP or badges beyond the
four monthly squad milestones.

## Admin: members

Admin CLI (needs `SUPABASE_SECRET_KEY` in `.env.local`; never `NEXT_PUBLIC_`,
never on Vercel, never committed):

```bash
npm run members -- add "<squad name>" "<member name>"   # prints squad_member_id
npm run members -- list
npm run members -- rename <squad_member_id> "<new name>"
npm run members -- remove <squad_member_id>   # also deletes their counts + history
```

To correct a count, use the app (pick the member) or the SQL editor.

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
  five migrations applied and recorded in `supabase_migrations.schema_migrations`.
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
| anon / authenticated | SELECT members, squads, squad_members, campaigns, monthly_targets, member_case_counts, squad_monthly_progress; call `submit_case_count(member, count, expected)`, `squad_momentum(squad)`, `member_recent_updates(member, limit)` | INSERT/UPDATE/DELETE any table; read raw `case_update_history` |
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
