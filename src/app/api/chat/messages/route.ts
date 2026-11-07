import { z } from "zod";
import { isDbConfigured } from "@/db";
import { listMessages } from "@/lib/ai/conversations";
import { isVaultKeyValid } from "@/lib/privacy/crypto";
import { getOwnerIdOrNull } from "@/lib/session";

export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => Response.json({ error }, { status });

// Lets the chat page check whether a reply that was still being written when the owner left has finished.
export async function GET(req: Request) {
  if (!isDbConfigured() || !isVaultKeyValid(process.env.VAULT_KEY)) return fail(503, "Not configured.");
  const ownerId = await getOwnerIdOrNull().catch(() => null);
  if (!ownerId) return fail(401, "Not signed in.");
  const c = z.string().uuid().safeParse(new URL(req.url).searchParams.get("c"));
  if (!c.success) return fail(400, "Invalid conversation.");
  const messages = await listMessages(ownerId, c.data);
  return Response.json({ messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })) });
}
