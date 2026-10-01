# CJO Squad Mission

Project foundation built on Next.js (App Router), TypeScript, Tailwind CSS and ESLint.

## Requirements

- Node.js `>=20.9.0` (see `.nvmrc`)
- npm

## Getting started

```bash
npm ci
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
| `npm run check`     | Lint, typecheck and build — run before pushing  |

## Project structure

```
src/
  app/          Routes, layouts and route-level UI (App Router)
  config/       Static app configuration (site name, metadata)
```

As the product grows, add these alongside `app/`:

```
src/
  components/   Reusable UI components (ui/ for primitives, feature folders for the rest)
  features/     Feature modules that group components, hooks and logic by domain
  lib/          Framework-agnostic utilities and service clients
  types/        Shared TypeScript types
```

Import from `src/` with the `@/` alias, e.g. `import { siteConfig } from "@/config/site"`.

## Conventions

- **Mobile-first:** write base styles for small screens and layer on `sm:`, `md:` and `lg:` overrides.
- **Server Components by default:** add `"use client"` only where interactivity requires it.
- **Theme tokens** live in `src/app/globals.css` (`background`, `foreground`, `muted`) and follow the system light/dark preference.
