import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb, withRetry } from "@/db";
import { profiles } from "@/db/schema";
import { isOwnerEmail } from "@/lib/owner";

export async function requireOwnerEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!isOwnerEmail(email, process.env.OWNER_EMAIL)) redirect("/login");
  return email as string;
}

// Returns the owner's profile id, creating the profile on first login.
export async function requireOwnerId(): Promise<string> {
  const email = (await requireOwnerEmail()).toLowerCase();
  const db = getDb();
  return withRetry(async () => {
    const found = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
    if (found[0]) return found[0].id;
    const created = await db
      .insert(profiles)
      .values({ email })
      .onConflictDoNothing()
      .returning({ id: profiles.id });
    if (created[0]) return created[0].id;
    const again = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
    return again[0].id;
  });
}

// For API routes: returns null instead of redirecting when the caller is not the signed-in owner.
export async function getOwnerIdOrNull(): Promise<string | null> {
  const session = await auth();
  if (!isOwnerEmail(session?.user?.email, process.env.OWNER_EMAIL)) return null;
  return requireOwnerId();
}
