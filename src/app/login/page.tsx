import { signIn } from "@/auth";
import { authProvidersConfigured } from "@/lib/owner";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const providers = authProvidersConfigured(process.env);
  const none = !providers.google && !providers.github;
  const btn =
    "flex min-h-12 w-full items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium";
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">LIFEOS</h1>
      <p className="text-sm text-muted">Private app. Only the owner account can sign in.</p>
      {error ? (
        <p role="alert" className="rounded-lg border border-red-400/50 p-3 text-sm">
          Sign-in was rejected. Use the owner account.
        </p>
      ) : null}
      {none ? (
        <p role="status" className="rounded-lg border border-line bg-surface p-3 text-sm">
          Not configured. Set AUTH_SECRET, OWNER_EMAIL and AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET (or the GITHUB equivalents).
        </p>
      ) : null}
      {providers.google ? (
        <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
          <button className={btn}>Continue with Google</button>
        </form>
      ) : null}
      {providers.github ? (
        <form action={async () => { "use server"; await signIn("github", { redirectTo: "/" }); }}>
          <button className={btn}>Continue with GitHub</button>
        </form>
      ) : null}
    </div>
  );
}
