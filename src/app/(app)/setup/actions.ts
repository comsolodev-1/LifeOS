"use server";

import { isDbConfigured } from "@/db";
import { describeAiError } from "@/lib/ai/retry";
import { askGemini, GatewayError } from "@/lib/privacy/gateway";
import { TokenMap } from "@/lib/privacy/tokens";
import { requireOwnerId } from "@/lib/session";

export type GeminiTestState = { ok?: boolean; message?: string };

export async function testGemini(): Promise<GeminiTestState> {
  if (!process.env.GEMINI_API_KEY) return { ok: false, message: "Not configured: GEMINI_API_KEY is missing." };
  if (!process.env.VAULT_KEY) return { ok: false, message: "Not configured: VAULT_KEY is missing." };
  if (!isDbConfigured()) return { ok: false, message: "Not configured: DATABASE_URL is missing." };
  try {
    const ownerId = await requireOwnerId();
    const res = await askGemini(ownerId, {
      purpose: "setup_test",
      messages: [{ role: "user", text: "Reply with exactly one word: OK" }],
      tokenMap: new TokenMap(),
    });
    return { ok: true, message: `Connected. Model ${res.model} answered in ${res.latencyMs} ms.` };
  } catch (error) {
    if (error instanceof GatewayError) return { ok: false, message: error.message };
    return { ok: false, message: describeAiError(error) };
  }
}
