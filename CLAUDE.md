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
(Postgres, Auth), hosted on Vercel. Run `npm run check` before pushing.

## Supabase architecture

| File | Use |
| --- | --- |
| `src/lib/supabase/server.ts` | Server Components, Server Actions, Route Handlers (`server-only`) |
| `src/lib/supabase/client.ts` | Client Components |
| `src/lib/supabase/proxy.ts` + `src/proxy.ts` | Refreshes the auth session cookie on each request (Next 16 `proxy`, formerly middleware) |
| `src/lib/supabase/env.ts` | Reads and validates env vars; throws a clear error if missing |
| `src/lib/supabase/database.types.ts` | **Generated** DB types (`npm run db:types`); never edit by hand |
| `src/lib/auth/dal.ts` | `verifySession()`: the authoritative auth check for pages/actions |
| `src/lib/auth/routes.ts` | Login path, signed-in home, protected path prefixes |
| `src/lib/auth/actions.ts` | `signInWithEmail` (magic link) and `signOut` Server Actions |
| `src/lib/data/current-member.ts` | Signed-in user's profile + squad (RLS-scoped) |
| `src/app/auth/confirm/route.ts` | Completes email links (PKCE `code` or `token_hash`); `next` is restricted to same-origin paths |

All clients are typed with `Database` and use the **publishable key** and run as the signed-in user, so RLS
applies. No service-role/secret key is used by the app. If one is ever needed,
keep it server-only (never `NEXT_PUBLIC_`) and never use it for user requests.
Create a new server client per request.

## Environment variables

Copy `.env.example` to `.env.local` (git-ignored). Set the same values in Vercel.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (or the legacy anon key) |

`NEXT_PUBLIC_` values are inlined at build time; redeploy after changing them.
Without them the site still renders, but any Supabase call throws.

## Database and migrations

- Schema lives only in `supabase/migrations/` (Supabase CLI). Never create
  tables in the dashboard. New change: `npx supabase migration new <name>`.
- Every new table needs, **in the same migration**: `enable row level security`,
  policies, and explicit grants. The initial migration revokes Supabase's
  automatic grants, so new objects are private until granted.
- Apply to the hosted project: `npx supabase login`, `npx supabase link
  --project-ref <ref>`, then `npx supabase db push`.
- Tests: `supabase/tests/database/*.test.sql` (pgTAP), run with
  `npm run db:test` (needs the local stack: `npx supabase start`, Docker).

Tables: `profiles` (auto-created on sign-up), `squads`, `squad_members` (one
squad per user), `campaigns`, `monthly_targets` (squad target per campaign
month), `member_case_counts` (a member's **current** monthly total, integer
0–1000), `case_update_history` (append-only audit, written by trigger).

The squad total is **derived**, never stored: read the
`squad_monthly_progress` view. Members write counts with the RPC
`set_my_case_count(p_campaign_id, p_month, p_case_count)`; validate input
first with `parseCaseCount` (`src/lib/validation/case-count.ts`).

Campaign targets are data (`monthly_targets`, seeded by migration: Oct 2026 =
20, Nov = 30, Dec = 40). Never hard-code targets in application code.

After any migration, regenerate types (`npm run db:types`, needs `supabase
link`) and commit `database.types.ts`.

## Authentication

Supabase Auth email magic links (passwordless; the link also confirms the
address), cookie sessions via `@supabase/ssr`, PKCE flow.

1. `/login` → `signInWithEmail` → `signInWithOtp` with
   `emailRedirectTo = <origin>/auth/confirm?next=<path>`.
2. The emailed link returns to `/auth/confirm`, which exchanges the code for a
   session and redirects to `next` (default `/squad`). Failures → `/auth/error`.
   Links must be opened in the browser that requested them (PKCE).
3. `/squad` is the signed-in home (the dashboard will live here). Users not
   yet in a squad see a waiting state.
4. Sign out: the `signOut` action clears the session and returns to `/login`.

On the server always use `supabase.auth.getClaims()` (verifies the JWT);
never trust `getSession()` on the server.

### Route protection (three layers)

1. **Proxy** (`src/lib/supabase/proxy.ts`): signed-out requests to protected
   prefixes (`PROTECTED_PREFIXES` in `routes.ts`, currently `/squad`) redirect
   to `/login?next=…`; signed-in users on `/login` go to `/squad`. Fails closed
   if Supabase env is missing. Optimistic only.
2. **DAL**: every protected page, Server Action and Route Handler must call
   `verifySession()` (or `getCurrentMember()`), which redirects if signed out.
3. **RLS**: the database only returns the caller's own squad.

New protected areas: add the prefix to `PROTECTED_PREFIXES` **and** call the
DAL in the page.

### Hosted Auth settings (Supabase dashboard → Authentication)

- URL Configuration → Site URL: `https://cjo-squad-mission-pi.vercel.app`
- Redirect URLs: `http://localhost:3000/**`,
  `https://cjo-squad-mission-pi.vercel.app/**`, and Vercel previews
  `https://cjo-squad-mission-*-mikegoh96-devs-projects.vercel.app/**`.
- Sign-ups: leave email sign-ups on for self-registration (new users wait for
  an admin to add them to a squad), or turn them off for invite-only.
- `supabase/config.toml` holds the equivalent **local** settings only.

## Authorization model (RLS)

| Role | Can | Cannot |
| --- | --- | --- |
| anon | nothing | read or write any table |
| member | read own squad, its members, counts, history and progress; read campaigns/targets; set **own** count; edit own display name | touch another member's count; read other squads; change membership, squads, campaigns or targets; set `is_admin`; write history |
| admin (`profiles.is_admin`) | manage squads, membership, campaigns, targets; correct counts (audited) | set `is_admin` or rewrite history via the API |

`is_admin` is granted only with SQL/service role, e.g.
`update public.profiles set is_admin = true where id = '<user-id>';`
RLS helpers are `security definer` functions in the unexposed `private` schema.

## Local development

```bash
npm ci
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev
```

Optional local Supabase (Docker): `npx supabase start`, then `npm run db:test`.
