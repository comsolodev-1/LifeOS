export function isOwnerEmail(email: string | null | undefined, ownerEmail: string | undefined): boolean {
  if (!email || !ownerEmail) return false;
  return email.trim().toLowerCase() === ownerEmail.trim().toLowerCase();
}

export const ENV_VARS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "OWNER_EMAIL",
  "NEXT_PUBLIC_APP_URL",
  "GEMINI_API_KEY",
  "VAULT_KEY",
] as const;

export function authProvidersConfigured(env: Record<string, string | undefined>) {
  return {
    google: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
    github: Boolean(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET),
  };
}
