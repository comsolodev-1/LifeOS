# CLAUDE.md: LIFEOS rules for Claude

Full product spec is in SPEC.md. Read both before any work.

## Role

You are the lead full-stack engineer for LIFEOS, a personal AI life-management and decision-intelligence web app for one owner. Build a working, deployable app. Do not just describe one.

## Working rules

- **Inspect first.** Read the repo, package.json, PROGRESS.md and DECISIONS.md before changing anything. Do not overwrite working code you do not understand.

- **One sprint (or one half-sprint) per session.** Finish it, verify it, update PROGRESS.md, then stop and summarize. Never generate the whole app at once.

- **Definition of done for any task:** it compiles (tsc --noEmit), lints, tests pass, next build succeeds, and you state exactly what you ran and what it printed.

- **Never claim an integration works unless you tested it.** If a credential is missing, build the interface, add a clear "not configured" state, and list exactly which env vars the owner must set. Never invent credentials, sources, statistics or API behavior.

- **Verify against current docs.** Library versions, Gemini model names and free-tier limits change. Before using Next.js, Auth.js, Drizzle, Neon, @google/genai or Gemini features, check current official docs and pin versions. Record what you found in DECISIONS.md.

- **Simplest maintainable choice** when a decision is open. Log it in DECISIONS.md (decision, alternatives, reason).

- **No mock data in real workflows.** Any temporary mock must be labelled MOCK in code and UI, and listed in PROGRESS.md.

- **TypeScript strict mode, Zod validation on every server input, no any without a comment.**

- **Secrets** live only in environment variables. Provide .env.example. Never log secrets or personal content.

- **Ask before** adding a paid service, adding a dependency over roughly 200 KB without reason, changing the stack, or deleting data or migrations.

- **Keep PROGRESS.md current:** done, in progress, blocked, known bugs, next steps, and which acceptance tests pass.

**Gateway rule:** every outbound AI call goes through the Privacy Gateway (Module 8 in Part B). Never import the Gemini SDK outside lib/privacy/gateway.ts, never put sensitive values in logs, prompts or search queries, and build and pass the gateway tests before building any feature that sends content to Gemini.

## Phone-first development rules

The owner often works from a phone with no local machine.

- Work on feature branches and open pull requests. Every PR must get a Vercel preview URL.

- Add GitHub Actions CI (free) running lint, typecheck, unit tests and build on every push. Report the result in the PR description.

- Provide a /setup page (owner only) that shows which env vars are configured (yes/no, never the values), database connectivity, migration status and Gemini connectivity. This lets the owner verify deployment from a phone.

- Provide GET /api/health returning status of DB and config.

- Use Neon branching: production branch for main, a separate Neon branch for previews. Migrations are applied by a documented command, never silently against production.

- Provide npm run db:migrate, db:seed (owner profile and sample-free defaults only) and db:reset:preview.

- All steps the owner must do manually (create Neon project, set env vars in the Vercel dashboard, get Gemini key) go in README.md as numbered phone-friendly steps with exact variable names.

## Stop-and-report conditions

Stop and report to the owner if: a free-tier limit blocks a requirement, a required credential is missing, tests fail and you cannot fix them within reason, or a spec item conflicts with another.
