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

## Access model (no login)

Two experiences, no accounts, no sign-in anywhere:

1. **Public dashboard `/`** — anyone with the URL sees squad progress
   (read-only). Data: `src/lib/data/dashboard.ts` → pure maths in
   `src/lib/progress.ts`. Contributions are listed alphabetically, never ranked.
2. **Private update link `/update/<token>`** — each member bookmarks their own
   link; the URL token is the credential. The page and the `saveCaseCount`
   Server Action pass the token to the database, which hashes it, finds the
   member and updates **only that member's** current total for the open
   campaign month. No member id is ever accepted from the client. Invalid,
   unknown and revoked links all 404.

Tokens: 256-bit random, 64 lowercase hex chars, generated in Postgres. Only
the SHA-256 hash is stored (`member_update_tokens`, one active link per member).
`/update/*` responses send `Referrer-Policy: no-referrer`, `X-Robots-Tag:
noindex` and `Cache-Control: no-store`.

| File | Use |
| --- | --- |
| `src/lib/supabase/server.ts` | Server-only Supabase client (publishable key, no session) |
| `src/lib/supabase/env.ts` | Reads and validates env vars |
| `src/lib/supabase/database.types.ts` | **Generated** DB types (`npm run db:types`); never edit by hand |
| `src/lib/data/dashboard.ts` | Public dashboard data (V1: the single/oldest squad, current campaign) |
| `src/lib/data/update-link.ts` | `getUpdateContext` / `submitCaseCount` via the token RPCs |
| `src/app/update/[token]/` | Update page, form and `saveCaseCount` Server Action |
| `scripts/update-links.mjs` | Admin CLI: add members, issue/regenerate/revoke links |

The app never uses a service-role/secret key; all browser-facing code paths
can do only what the `anon` role can do.

## Admin: members and links

Admin CLI (needs `SUPABASE_SECRET_KEY` in `.env.local`; never `NEXT_PUBLIC_`,
never on Vercel, never committed):

```bash
npm run links -- add "<squad name>" "<member name>"   # prints squad_member_id
npm run links -- issue <squad_member_id>   # prints the link ONCE; old link stops working
npm run links -- revoke <squad_member_id>
npm run links -- list                      # who has an active link (never tokens)
```

Equivalent SQL (Supabase SQL editor): `select public.admin_issue_update_token('<squad_member_id>');`
Set `SITE_URL` to print links for another host (default: production URL).

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
  three migrations applied and recorded in `supabase_migrations.schema_migrations`.
- Tests: `supabase/tests/database/*.test.sql` (pgTAP), run with
  `npm run db:test` (needs `npx supabase start`, Docker).
- After any migration, regenerate types (`npm run db:types`) and commit them.

Tables: `members`, `squads`, `squad_members` (one squad per member),
`campaigns` (with `time_zone`), `monthly_targets` (squad target per campaign
month), `member_case_counts` (a member's **current** monthly total, integer
0–1000), `case_update_history` (append-only audit, written by trigger;
`changed_by` = the member whose link was used, null for admin changes),
`member_update_tokens` (hashes only).

The squad total is **derived**, never stored (`squad_monthly_progress` view /
`computeSquadProgress`). Campaign targets are data (`monthly_targets`; seeded
Oct 2026 = 20, Nov = 30, Dec = 40). Never hard-code targets, months or years.
The open month is resolved in the campaign's `time_zone`.

## Permission model (RLS + grants)

| Role | Can | Cannot |
| --- | --- | --- |
| anon / authenticated | SELECT members, squads, squad_members, campaigns, monthly_targets, member_case_counts, squad_monthly_progress; call `get_update_context(token)` and `submit_case_count(token, count)` | INSERT/UPDATE/DELETE any table; read `case_update_history` or `member_update_tokens`; call `admin_*` functions |
| service_role (admin CLI) | `admin_issue_update_token`, `admin_revoke_update_token`, `admin_update_link_status`; manage squads/members | read token hashes directly |

The token functions are `security definer` with `search_path = ''`; private
helpers live in the unexposed `private` schema. Supabase Auth is unused
(email sign-ups disabled on the hosted project).

## Local development

```bash
npm ci
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev
```
