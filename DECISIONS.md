# DECISIONS

- Next.js 16: middleware is named proxy.ts. next-auth v5 beta supports it (peer range includes 16).
- Tailwind 3.4 instead of v4 to keep config simple and stable.
- No shadcn/ui: its generator needs network access that was unavailable; plain Tailwind components in src/components/ui.tsx. Add shadcn later if wanted.
- Auth.js JWT sessions, no adapter: single owner, so no users/accounts/sessions tables. The owner profile row is created on first login.
- Owner allowlist is enforced in the signIn callback and again in requireOwnerEmail on every page and server action.
- All task queries go through src/lib/dal/tasks.ts and require ownerId. Do not query tasks elsewhere.
- Deadlines entered as dates are interpreted as end of day in Asia/Manila (UTC+8, no DST) and stored as UTC. Per-user timezone comes with the Life Profile sprint.
- Mobile nav has 4 tabs plus a More page rather than a bottom sheet.
- System fonts instead of next/font/google, so builds need no network.
- Placeholder pages for later sprints say "Not built yet" instead of showing fake data.
- Deleting a project keeps its tasks (project_id set null). Deleting a task removes its dependency links.
- Dependencies are advisory: a blocked task shows a badge but can still be marked done.
- Cycle checks load the owner's edges and walk them in code (neon-http has no interactive transactions). Fine for one user.
- The DAL is tested against PGlite (real Postgres in memory) through a test-only db seam in src/db/index.ts.
- Expected failures throw AppError and are never retried by withRetry.
