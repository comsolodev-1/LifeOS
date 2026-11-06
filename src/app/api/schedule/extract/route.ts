import { z } from "zod";
import { describeAiError } from "@/lib/ai/retry";
import { isDbConfigured } from "@/db";
import { decodeUpload, MIME } from "@/lib/calendar/image";
import { EXTRACTION_JSON_SCHEMA, extractionPrompt, normalizeCandidates, parseModelJson } from "@/lib/calendar/extraction";
import { localDateString } from "@/lib/calendar/timezone";
import { getOwnerTimezone } from "@/lib/dal/events";
import { AppError } from "@/lib/errors";
import { isVaultKeyValid } from "@/lib/privacy/crypto";
import { defaultDeps, GatewayError, sendThroughGateway } from "@/lib/privacy/gateway";
import { TokenMap } from "@/lib/privacy/tokens";
import { listVault } from "@/lib/privacy/vault";
import { getOwnerIdOrNull } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ image: z.string().min(1), consent: z.literal(true) });
const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request) {
  if (!isDbConfigured() || !isVaultKeyValid(process.env.VAULT_KEY) || !process.env.GEMINI_API_KEY) return fail(503, "AI is not configured. Check /setup.");
  const ownerId = await getOwnerIdOrNull().catch(() => null);
  if (!ownerId) return fail(401, "Not signed in.");

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Confirm that Google Gemini may process this photo, then try again.");

  try {
    // The image is processed in memory only: metadata is stripped again here, and nothing is written to disk or the database.
    const { bytes, type } = decodeUpload(parsed.data.image);
    const tz = await getOwnerTimezone(ownerId);
    const today = localDateString(new Date(), tz);
    const result = await sendThroughGateway(
      {
        purpose: "schedule_extract",
        system: extractionPrompt(today, tz),
        messages: [
          { role: "user", parts: [{ text: "Extract the events from this image." }, { inlineData: { mimeType: MIME[type], data: Buffer.from(bytes).toString("base64") } }], source: "image" },
        ],
        vault: await listVault(ownerId),
        tokenMap: new TokenMap(),
        jsonSchema: EXTRACTION_JSON_SCHEMA,
      },
      defaultDeps(ownerId),
    );
    const raw = parseModelJson(result.text);
    if (raw === null) return fail(502, "The AI did not return a readable schedule. Try a clearer photo.");
    const { candidates, dropped } = normalizeCandidates(raw, today);
    return Response.json({ candidates, dropped, timezone: tz, today });
  } catch (error) {
    if (error instanceof AppError) return fail(400, error.message);
    if (error instanceof GatewayError) return fail(422, error.message);
    return fail(502, describeAiError(error));
  }
}
