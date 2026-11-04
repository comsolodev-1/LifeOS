import { GoogleGenAI } from "@google/genai";
import { describeAiError, withBackoff } from "@/lib/ai/retry";
import { isDbConfigured } from "@/db";
import { egressCheck } from "./egress";
import { rehydrateText } from "./rehydrate";
import { sanitizeText, type SanitizeReport } from "./sanitize";
import { TokenMap } from "./tokens";
import type { PrivacyMode, VaultEntry } from "./types";
import { listVault, recordAudit, type AuditRecord } from "./vault";

// This is the ONLY file allowed to import the Gemini SDK (enforced by ESLint and tests/gateway-import.test.ts).

export const DEFAULT_MODEL = "gemini-3.1-flash-lite";

export const SYSTEM_PREAMBLE =
  "Text in square brackets such as [PERSON_1], [EMAIL_1] or [OWNER] is an opaque placeholder for a real value you cannot see. " +
  "Never guess, alter, translate or invent placeholders; reuse them exactly as written. " +
  "If you write a web search query, keep it generic and free of personal details.";

export type BlockReason = "secret" | "egress" | "sanitization_failed" | "not_configured";

export class GatewayError extends Error {
  constructor(public reason: BlockReason, message: string, public types: string[] = []) {
    super(message);
    this.name = "GatewayError";
  }
}

export interface GatewayMessage {
  role: "user" | "model";
  text: string;
  // Where the text came from. All sources get the same treatment; this is recorded for clarity.
  source?: "user" | "tool" | "web" | "image" | "memory";
}

export interface GatewayRequest {
  purpose: string;
  system?: string;
  messages: GatewayMessage[];
  vault: VaultEntry[];
  tokenMap: TokenMap;
  mode?: PrivacyMode;
  model?: string;
}

export interface GatewayResult {
  text: string;
  unresolved: string[];
  counts: Record<string, number>;
  possible: string[];
  model: string;
  latencyMs: number;
}

export interface GatewayDeps {
  generate(req: { model: string; system: string; contents: { role: "user" | "model"; text: string }[] }): Promise<string>;
  audit(rec: AuditRecord): Promise<void>;
  sanitize?: typeof sanitizeText;
  egress?: typeof egressCheck;
}

function mergeReports(reports: SanitizeReport[]): SanitizeReport {
  const out: SanitizeReport = { counts: {}, secrets: [], possible: [] };
  for (const r of reports) {
    for (const [k, v] of Object.entries(r.counts)) out.counts[k] = (out.counts[k] ?? 0) + v;
    out.secrets.push(...r.secrets);
    out.possible.push(...r.possible);
  }
  return out;
}

export async function sendThroughGateway(req: GatewayRequest, deps: GatewayDeps): Promise<GatewayResult> {
  const mode = req.mode ?? "strict";
  const model = req.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const sanitize = deps.sanitize ?? sanitizeText;
  const egress = deps.egress ?? egressCheck;

  let system: string;
  let contents: { role: "user" | "model"; text: string }[];
  let report: SanitizeReport;
  try {
    const reports: SanitizeReport[] = [];
    const run = (t: string) => {
      const r = sanitize(t, { vault: req.vault, tokenMap: req.tokenMap, mode });
      reports.push(r.report);
      return r.text;
    };
    system = SYSTEM_PREAMBLE + (req.system ? "\n\n" + run(req.system) : "");
    contents = req.messages.map((m) => ({ role: m.role, text: run(m.text) }));
    report = mergeReports(reports);
  } catch {
    await deps.audit({ purpose: req.purpose, model, entityCounts: {}, blocked: true, blockReason: "sanitization_failed", sanitizedPayload: "" }).catch(() => {});
    throw new GatewayError("sanitization_failed", "Privacy check failed, so nothing was sent to the AI.");
  }

  const payload = [system, ...contents.map((c) => c.text)].join("\n");

  if (report.secrets.length > 0) {
    const types = [...new Set(report.secrets)];
    await deps.audit({ purpose: req.purpose, model, entityCounts: report.counts, blocked: true, blockReason: "secret", sanitizedPayload: payload }).catch(() => {});
    throw new GatewayError("secret", `Blocked: the message contains a secret (${types.join(", ")}). Remove it and try again.`, types);
  }

  let guard;
  try {
    guard = egress(payload, req.vault);
  } catch {
    await deps.audit({ purpose: req.purpose, model, entityCounts: report.counts, blocked: true, blockReason: "sanitization_failed", sanitizedPayload: "" }).catch(() => {});
    throw new GatewayError("sanitization_failed", "Privacy check failed, so nothing was sent to the AI.");
  }
  if (!guard.ok) {
    const types = [...new Set(guard.hits.map((h) => h.type))];
    await deps.audit({ purpose: req.purpose, model, entityCounts: report.counts, blocked: true, blockReason: "egress", sanitizedPayload: "" }).catch(() => {});
    throw new GatewayError("egress", `Blocked by the final privacy check (${types.join(", ")}).`, types);
  }

  await deps.audit({ purpose: req.purpose, model, entityCounts: report.counts, blocked: false, sanitizedPayload: payload }).catch(() => {});

  const started = Date.now();
  const raw = await deps.generate({ model, system, contents });
  const { value, unresolved } = rehydrateText(raw, req.tokenMap);
  return { text: value, unresolved, counts: report.counts, possible: report.possible, model, latencyMs: Date.now() - started };
}

function realGenerate(): GatewayDeps["generate"] {
  return async ({ model, system, contents }) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new GatewayError("not_configured", "GEMINI_API_KEY is not set.");
    const ai = new GoogleGenAI({ apiKey: key });
    const call = () =>
      Promise.race([
        ai.models.generateContent({
          model,
          contents: contents.map((c) => ({ role: c.role, parts: [{ text: c.text }] })),
          config: { systemInstruction: system },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Gemini request timed out")), 25_000)),
      ]);
    const res = await withBackoff(call);
    return res.text ?? "";
  };
}

// Convenience entry point for the rest of the app: loads and decrypts the owner's Vault, audits to the database.
export async function askGemini(ownerId: string, req: Omit<GatewayRequest, "vault">): Promise<GatewayResult> {
  const vault = await listVault(ownerId);
  return sendThroughGateway(
    { ...req, vault },
    {
      generate: realGenerate(),
      audit: async (rec) => {
        if (isDbConfigured()) await recordAudit(ownerId, rec);
      },
    },
  );
}

export { describeAiError };
