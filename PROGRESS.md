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

## Sprint 2: Tasks and projects (built, tests pass)
- Projects: create, rename, status, delete (tasks are kept), progress bar, project page with its own tasks
- Tasks: edit page (title, notes, status incl. doing, priority, deadline, estimate, project), filters (status, priority, project), sorting, search, blocked badge
- Dependencies with cycle prevention, self-link and cross-owner link rejection
- Data-access layer tests run against a real in-memory Postgres (PGlite): owner isolation, ownership of linked projects/tasks, cycles, cascades. 70 tests total.
- Migration 0002: task_dependencies
- Default Gemini model is gemini-3.1-flash-lite

## Sprint 3: AI assistant and memory (built, tests pass)
- Chat at /ai with streaming, persisted conversations (encrypted), delete chat, AI replies visually distinct
- Gateway extended: function calling, streaming, thought-signature replay, tool results and arguments sanitized, arguments rehydrated
- Tools: get_user_context, get_tasks, get_projects, search_memories (run immediately); create_task, update_task, create_project, propose_memory (propose only)
- Propose-then-confirm: suggestion cards with editable fields, Confirm and Dismiss; exactly-once confirm via atomic status claim; 7-day expiry; ai_action_logs
- Memory: AI proposals need approval; approved memories retrieved by keyword into new conversations; Life Profile page (life context, approve, edit, delete, add)
- Migration 0003: life_context, conversations, messages, memories, pending_actions, ai_action_logs
- 86 tests total (scripted-model end-to-end on in-memory Postgres)

## Sprint 4: Schedule intelligence (built, tests pass)
- Calendar: day, week (Monday start) and month views; add, edit, delete events; fixed commitments; repeating events (daily, weekly on chosen days, monthly, every N, until or count); skip a single occurrence
- Overlap detection (back-to-back is not a conflict) and free-time gaps in the day view; today's schedule on Home
- Timezones: everything stored as UTC, owner timezone (default Asia/Manila) used only for input and display; recurring events keep local wall-clock time across daylight saving (tested with New York)
- Photo import: camera or gallery, resized and re-encoded on the phone (drops EXIF/GPS), black-box cover tool, per-upload consent screen, server strips metadata again, image processed in memory only, never stored
- Extraction: JSON-schema response, per-field confidence, every value validated; low-confidence or invalid fields are flagged and the item starts unselected; nothing saves until the owner reviews and taps Save; rows re-validated on the server
- AI chat can read the calendar (get_events)
- Migration 0004: events
- 132 tests total

## Sprint 4 fix: consistent photo extraction
- Deterministic mode (temperature 0, bigger output budget) for extraction
- Prompt now demands every block, one event per date, a per-column count check, and dates when the picture shows them
- Up to 80 events per photo, sorted by date and time; Select all/none; per-row "Repeat every week"; "Missed some? Scan again" merges only new events
- 140 tests total

## Sprint 4 fix 2: clean titles, no duplicates, cleanup
- Verified with a real photo: 32 of 32 blocks found, identical across 3 runs
- Titles cleaned (leading time, wrapping brackets, ALL CAPS)
- Saving skips events that already exist (same title and times); "Delete all imported events" button on the import page
- 158 tests total

## Sprint 4 fix 3: import survives navigation
- Import state moved into a provider in the app layout: a running scan continues while you use other pages; a banner on every page shows progress and "ready to review"
- Review list (text only, never the photo) kept in session storage so a refresh does not lose edits; cleared on save, discard, or when the tab closes
- "Discard and start over" button
- 162 tests total

## Sprint 4 fix 4: AI chat survives leaving the page
- Server finishes and saves a reply even if the browser disconnects (route and turn runner no longer fail when the client is gone)
- Returning to a conversation with a recent unanswered message polls for the reply and shows it when ready; suggestion cards reload from the database
- Opening AI reopens the last chat (id kept in localStorage); "New chat" uses ?new=1
- 164 tests total

## Not verified
Navigation behaviour in a real browser (the logic is tested, the screens are not), a real phone photo through Gemini (needs your key and a photo), the touch drawing of cover boxes on a phone, and a real streamed Gemini turn with function calling on gemini-3.1-flash-lite (the scripted tests cover our side only). Sprint 2 screens on a phone and against Neon. A real Gemini call (needs your key), the default model id gemini-3.8-flash (override with GEMINI_MODEL), Vault add/delete against Neon.

## Next
- Sprint 5: goals, milestones and habits, per SPEC.md
- Pending from spec: db:seed and db:reset:preview scripts (profile is created on first login instead of seeding)
