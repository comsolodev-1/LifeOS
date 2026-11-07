import { z } from "zod";
import { runAssistantTurn, type ChatEvent } from "@/lib/ai/assistant";
import { isDbConfigured } from "@/db";
import { defaultDeps } from "@/lib/privacy/gateway";
import { isVaultKeyValid } from "@/lib/privacy/crypto";
import { getOwnerIdOrNull } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ message: z.string().max(10_000), conversationId: z.string().uuid().optional() });

function json(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  if (!isDbConfigured() || !isVaultKeyValid(process.env.VAULT_KEY) || !process.env.GEMINI_API_KEY) {
    return json(503, "AI is not configured. Check /setup.");
  }
  const ownerId = await getOwnerIdOrNull().catch(() => null);
  if (!ownerId) return json(401, "Not signed in.");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, "Invalid request.");

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream({
    cancel() {
      open = false;
    },
    async start(controller) {
      const send = (event: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        await runAssistantTurn(ownerId, { text: parsed.data.message, conversationId: parsed.data.conversationId }, defaultDeps(ownerId), send);
      } catch {
        send({ type: "error", message: "Something went wrong. Try again." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
