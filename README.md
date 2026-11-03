# LIFEOS

Private personal life-management app. Free stack: Next.js on Vercel, Neon Postgres, Auth.js, Gemini (from Sprint 1b).
Read CLAUDE.md (rules) and SPEC.md (product spec). Status is in PROGRESS.md.

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (see below)
3. `npm run db:migrate`
4. `npm run dev`, open http://localhost:3000, then /setup to check everything is green

## Accounts to create (all free)
- **Neon**: create a project, copy the pooled connection string into DATABASE_URL.
- **Google OAuth**: Google Cloud Console, APIs & Services, Credentials, OAuth client (Web). Redirect URI: `<APP_URL>/api/auth/callback/google`. Or **GitHub OAuth app** with callback `<APP_URL>/api/auth/callback/github`. Put IDs/secrets in AUTH_GOOGLE_* or AUTH_GITHUB_*.
- `AUTH_SECRET`: `openssl rand -base64 32`
- `OWNER_EMAIL`: the one email allowed to sign in (must match your Google/GitHub email)
- `VAULT_KEY`: `openssl rand -base64 32`. Back it up; losing it makes Vault entries unreadable (used from Sprint 1b).

## Deploy
Push to GitHub, import the repo in Vercel (Hobby), add the same env vars, set NEXT_PUBLIC_APP_URL to the Vercel URL, add that URL's callback to your OAuth app, then run `npm run db:migrate` once against the Neon database. On your phone, open the site and use Add to Home Screen.

## Scripts
`dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`
