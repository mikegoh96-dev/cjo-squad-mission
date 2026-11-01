# Squad Mission (starter)

Your squad's own copy of the CJO Squad Mission app. It's a collective progress app: one shared link, no login. Each member taps -/+ on their own card, and the squad works through monthly missions together. It includes milestones, momentum, a Squad Recap, and weekly and monthly recap videos for Instagram Stories, plus optional push notifications.

**Setting it up for your squad? Start with [docs/BUILD-YOUR-SQUAD-APP.md](docs/BUILD-YOUR-SQUAD-APP.md).**

It takes about an hour with free GitHub, Supabase and Vercel accounts, and Claude Code can do most of it with you.

Architecture, the security model and conventions are in [CLAUDE.md](CLAUDE.md).

## Your squad lives in two files

| File | What goes in it |
| --- | --- |
| `src/config/squad.ts` | App name, short name, recap title and file-name prefix, notification wording, and avatars per member |
| `squad.setup.json` (copy `squad.setup.example.json`) | Squad name, members, campaign dates, time zone and monthly targets. `npm run setup` turns it into one SQL script for Supabase. This file is git-ignored |

## Requirements

- Node.js `>=20.9.0` (see `.nvmrc`)
- npm

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run setup` | Generate `supabase/setup.local.sql` (squad, members, campaign, targets; add `-- --push` for notifications) |
| `npm run members` | Admin: list / add / rename / remove members (needs the secret key in `.env.local`) |
| `npm run check` | Lint, typecheck, unit tests and build. Run it before every push |
| `npm run db:test` | Database / security tests (needs `npx supabase start`) |
| `npm run build` / `npm run start` | Production build / serve |

## Project structure

```
src/
  app/(dashboard)/  Squad board, Mission and Settings screens
  components/       UI, mission/, squad/, recap/ (recap + video), push/
  config/           squad.ts (your squad) and site.ts
  lib/              Pure, unit-tested logic (mission, progress, recap, push) and data loaders
scripts/            setup.mjs (one-time database setup), members.mjs (admin CLI)
supabase/
  migrations/       Database schema, the source of truth (apply with `npx supabase db push`)
  tests/            pgTAP database and permission tests
docs/               BUILD-YOUR-SQUAD-APP.md (setup guide and Claude Code master prompt)
```
