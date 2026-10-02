# CJO Squad Mission

Collective squad progress app built on Next.js (App Router), TypeScript, Tailwind CSS and Supabase.

One shared link, no login: the squad dashboard at `/` (each member taps -/+ on their own card) and the mission view at `/mission`. Architecture, security model, admin commands and migrations are documented in [CLAUDE.md](CLAUDE.md).

## Requirements

- Node.js `>=20.9.0` (see `.nvmrc`)
- npm

## Getting started

```bash
npm ci
cp .env.example .env.local   # add Supabase URL + publishable key
npm run dev
```

Open http://localhost:3000.

## Scripts

| Script              | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start the dev server (Turbopack)                |
| `npm run build`     | Create a production build                       |
| `npm run start`     | Serve the production build                      |
| `npm run lint`      | Run ESLint                                      |
| `npm run typecheck` | Generate route types and run `tsc --noEmit`     |
| `npm run test`      | Unit tests (Node test runner)                   |
| `npm run db:test`   | Database/RLS tests (needs `npx supabase start`) |
| `npm run db:types`  | Regenerate DB types from the linked Supabase project |
| `npm run members`   | Admin: list / add / rename / remove members (see CLAUDE.md) |
| `npm run check`     | Lint, typecheck, test and build — run before pushing |

## Project structure

```
src/
  app/(dashboard)/  Dashboard and Mission screens, loading skeleton, error + retry
  components/       UI primitives (ui.tsx, icons), mission/ and squad/ (live member cards)
  config/           Static app configuration (site name, metadata)
  lib/              mission.ts + progress.ts (pure maths), data loaders, Supabase client, validation
scripts/            Admin CLI for members
supabase/
  migrations/       Version-controlled database schema (source of truth)
  tests/            pgTAP database and RLS tests
```

Import from `src/` with the `@/` alias, e.g. `import { siteConfig } from "@/config/site"`.

## Conventions

- **Mobile-first:** write base styles for small screens and layer on `sm:`, `md:` and `lg:` overrides.
- **Server Components by default:** add `"use client"` only where interactivity requires it.
- **Theme tokens** live in `src/app/globals.css` (`background`, `surface`, `foreground`, `muted`, `accent`, `brand-from/to`, `good`, `flame`, `warning`, `danger`, …) and follow the system light/dark preference.
- **Motion** is subtle and disabled under `prefers-reduced-motion`.
- **Calculations stay out of JSX:** progress, status and messages come from `src/lib/mission.ts` / `src/lib/progress.ts`.
