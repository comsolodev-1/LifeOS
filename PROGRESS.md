# PROGRESS

## Sprint 1a: Foundation (built, verified locally)
- Next.js 16 + Tailwind 3 + TypeScript strict, system font stack, light/dark via prefers-color-scheme
- Drizzle schema + first migration: profiles, projects, tasks (owner_id on every row, CHECK constraints, indexes)
- Auth.js v5 (Google and/or GitHub), JWT sessions, owner-email allowlist, proxy.ts protects every route except /login, /api/auth, /api/health
- Responsive nav: bottom tab bar on mobile, sidebar on desktop, quick-add button
- Dashboard (open task count, next up), Tasks (add, search, filter, mark done, delete) as the first real feature
- /setup status page (env presence, DB connection, migrations) and /api/health
- PWA manifest and icon, security headers, CI workflow (lint, typecheck, test, build)
- 11 unit tests (owner allowlist, task input validation)

## Verified here
lint, typecheck, tests, production build, and a smoke run: protected routes redirect to /login, login/health/manifest respond.

## Not verified (needs real credentials)
Real sign-in with Google/GitHub, Neon queries and migration, Vercel deploy, install-to-home-screen on a phone.

## Next
- Sprint 1b: Privacy Gateway, Gemini client, VAULT_KEY encryption, ESLint/CI rule restricting @google/genai
- Then Sprint 2 (projects, task links), per SPEC.md
- Pending from spec: db:seed and db:reset:preview scripts (profile is created on first login instead of seeding)
