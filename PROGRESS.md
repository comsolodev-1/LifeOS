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

## Sprint 1b: Privacy Gateway and Gemini client (built, tests pass)
- src/lib/privacy: AES-256-GCM crypto, detectors (PH IDs, cards with Luhn, phones, emails, IPs, addresses, birthdates, ages, money, possible names), Vault matching, per-conversation token map, sanitizer, egress guard, rehydration, gateway
- gateway.ts is the only file that imports @google/genai (ESLint rule + CI test). Fails closed. Secrets block the request. Audit keeps what Gemini saw for 14 days.
- Vault and audit UI at /settings/privacy, Gemini test button on /setup
- Migration 0001: privacy_vault_entries, privacy_token_maps, privacy_audit
- 61 tests total (golden corpus, 300-case property test, tampering, injection, fail-closed, SDK isolation)

## Not verified
A real Gemini call (needs your key), the default model id gemini-3.8-flash (override with GEMINI_MODEL), Vault add/delete against Neon.

## Next
- Then Sprint 2 (projects, task links), per SPEC.md
- Pending from spec: db:seed and db:reset:preview scripts (profile is created on first login instead of seeding)
