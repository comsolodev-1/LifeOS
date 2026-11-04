import { GoogleGenAI } from "@google/genai";
import { describeAiError, withBackoff } from "@/lib/ai/retry";
import { isDbConfigured } from "@/db";
import { egressCheck } from "./egress";
import { rehydrateDeep, rehydrateText } from "./rehydrate";
import { sanitizeText, type SanitizeReport } from "./sanitize";
import { StreamRehydrator } from "./stream";
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

export type GatewayPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface GatewayMessage {
  role: "user" | "model";
  text?: string;
  parts?: GatewayPart[];
  // Where the text came from. All sources get the same treatment; this is recorded for clarity.
  source?: "user" | "tool" | "web" | "image" | "memory";
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GatewayRequest {
  purpose: string;
  system?: string;
  messages: GatewayMessage[];
  vault: VaultEntry[];
  tokenMap: TokenMap;
  mode?: PrivacyMode;
  model?: string;
  tools?: ToolDeclaration[];
}

export interface PreparedContent {
  role: "user" | "model";
  text: string;
  parts: GatewayPart[];
}

export interface PreparedRequest {
  model: string;
  system: string;
  contents: PreparedContent[];
  tools?: ToolDeclaration[];
}

export type StreamChunk =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string };

export interface GatewayResult {
  text: string;
  unresolved: string[];
  counts: Record<string, number>;
  possible: string[];
  model: string;
  latencyMs: number;
}

export type GatewayEvent =
  | { type: "text"; delta: string }
  | { type: "functionCall"; name: string; args: Record<string, unknown>; thoughtSignature?: string }
  | { type: "done"; unresolved: string[]; counts: Record<string, number>; possible: string[]; model: string };

export interface GatewayDeps {
  generate(req: PreparedRequest): Promise<string>;
  generateStream?(req: PreparedRequest): AsyncIterable<StreamChunk>;
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

function renderPayload(system: string, contents: PreparedContent[]): string {
  const lines = [system];
  for (const c of contents) {
    for (const p of c.parts) {
      if ("text" in p) lines.push(`${c.role}: ${p.text}`);
      else if ("functionCall" in p) lines.push(`${c.role} calls ${p.functionCall.name}: ${JSON.stringify(p.functionCall.args)}`);
      else lines.push(`${c.role} result of ${p.functionResponse.name}: ${JSON.stringify(p.functionResponse.response)}`);
    }
  }
  return lines.join("\n");
}

// Sanitizes, runs the egress guard, audits, and returns the exact request that may leave the server. Fails closed.
async function prepare(
  req: GatewayRequest,
  deps: GatewayDeps,
): Promise<{ prepared: PreparedRequest; report: SanitizeReport }> {
  const mode = req.mode ?? "strict";
  const model = req.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const sanitize = deps.sanitize ?? sanitizeText;
  const egress = deps.egress ?? egressCheck;
  const fail = async (reason: BlockReason, counts: Record<string, number>, payload: string): Promise<never> => {
    await deps.audit({ purpose: req.purpose, model, entityCounts: counts, blocked: true, blockReason: reason, sanitizedPayload: payload }).catch(() => {});
    throw new GatewayError(reason, "Privacy check failed, so nothing was sent to the AI.");
  };

  let system: string;
  let contents: PreparedContent[];
  let report: SanitizeReport;
  try {
    const reports: SanitizeReport[] = [];
    const run = (t: string) => {
      const r = sanitize(t, { vault: req.vault, tokenMap: req.tokenMap, mode });
      reports.push(r.report);
      return r.text;
    };
    const deep = (v: unknown): unknown => {
      if (typeof v === "string") return run(v);
      if (Array.isArray(v)) return v.map(deep);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]));
      return v;
    };
    system = SYSTEM_PREAMBLE + (req.system ? "\n\n" + run(req.system) : "");
    contents = req.messages.map((m) => {
      const source: GatewayPart[] = m.parts ?? [{ text: m.text ?? "" }];
      const parts = source.map((p): GatewayPart => {
        if ("text" in p) return { text: run(p.text) };
        if ("functionCall" in p) {
          return { functionCall: { name: p.functionCall.name, args: deep(p.functionCall.args) as Record<string, unknown> }, thoughtSignature: p.thoughtSignature };
        }
        return { functionResponse: { name: p.functionResponse.name, response: deep(p.functionResponse.response) as Record<string, unknown> } };
      });
      const text = parts.flatMap((p) => ("text" in p ? [p.text] : [])).join("\n");
      return { role: m.role, text, parts };
    });
    report = mergeReports(reports);
  } catch {
    return fail("sanitization_failed", {}, "");
  }

  const payload = renderPayload(system, contents);

  if (report.secrets.length > 0) {
    const types = [...new Set(report.secrets)];
    await deps.audit({ purpose: req.purpose, model, entityCounts: report.counts, blocked: true, blockReason: "secret", sanitizedPayload: payload }).catch(() => {});
    throw new GatewayError("secret", `Blocked: the message contains a secret (${types.join(", ")}). Remove it and try again.`, types);
  }

  let guard;
  try {
    guard = egress(payload, req.vault);
  } catch {
    return fail("sanitization_failed", report.counts, "");
  }
  if (!guard.ok) {
    const types = [...new Set(guard.hits.map((h) => h.type))];
    await deps.audit({ purpose: req.purpose, model, entityCounts: report.counts, blocked: true, blockReason: "egress", sanitizedPayload: "" }).catch(() => {});
    throw new GatewayError("egress", `Blocked by the final privacy check (${types.join(", ")}).`, types);
  }

  await deps.audit({ purpose: req.purpose, model, entityCounts: report.counts, blocked: false, sanitizedPayload: payload }).catch(() => {});
  return { prepared: { model, system, contents, tools: req.tools }, report };
}

export async function sendThroughGateway(req: GatewayRequest, deps: GatewayDeps): Promise<GatewayResult> {
  const { prepared, report } = await prepare(req, deps);
  const started = Date.now();
  const raw = await deps.generate(prepared);
  const { value, unresolved } = rehydrateText(raw, req.tokenMap);
  return { text: value, unresolved, counts: report.counts, possible: report.possible, model: prepared.model, latencyMs: Date.now() - started };
}

// Streaming variant. Text is rehydrated as it streams; function-call arguments are rehydrated before being returned.
export async function* streamThroughGateway(req: GatewayRequest, deps: GatewayDeps): AsyncGenerator<GatewayEvent> {
  if (!deps.generateStream) throw new GatewayError("not_configured", "Streaming is not available.");
  const { prepared, report } = await prepare(req, deps);
  const rehydrator = new StreamRehydrator(req.tokenMap);
  const unresolved: string[] = [];
  for await (const chunk of deps.generateStream(prepared)) {
    if ("text" in chunk) {
      const delta = rehydrator.push(chunk.text);
      if (delta) yield { type: "text", delta };
    } else {
      const tail = rehydrator.flush();
      if (tail) yield { type: "text", delta: tail };
      const r = rehydrateDeep(chunk.functionCall.args, req.tokenMap);
      unresolved.push(...r.unresolved);
      yield { type: "functionCall", name: chunk.functionCall.name, args: r.value, thoughtSignature: chunk.thoughtSignature };
    }
  }
  const tail = rehydrator.flush();
  if (tail) yield { type: "text", delta: tail };
  yield { type: "done", unresolved: [...unresolved, ...rehydrator.unresolved], counts: report.counts, possible: report.possible, model: prepared.model };
}

function sdkContents(contents: PreparedContent[]) {
  return contents.map((c) => ({
    role: c.role,
    parts: c.parts.map((p) =>
      "text" in p
        ? { text: p.text }
        : "functionCall" in p
          ? { functionCall: p.functionCall, ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}) }
          : { functionResponse: p.functionResponse },
    ),
  }));
}

function client(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GatewayError("not_configured", "GEMINI_API_KEY is not set.");
  return new GoogleGenAI({ apiKey: key });
}

function sdkConfig(req: PreparedRequest) {
  return {
    systemInstruction: req.system,
    ...(req.tools?.length
      ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }] }
      : {}),
  };
}

function realDeps(): Pick<GatewayDeps, "generate" | "generateStream"> {
  return {
    async generate(req) {
      const ai = client();
      const call = () =>
        Promise.race([
          ai.models.generateContent({ model: req.model, contents: sdkContents(req.contents), config: sdkConfig(req) }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Gemini request timed out")), 25_000)),
        ]);
      const res = await withBackoff(call);
      return res.text ?? "";
    },
    async *generateStream(req) {
      const ai = client();
      const stream = await withBackoff(() =>
        ai.models.generateContentStream({ model: req.model, contents: sdkContents(req.contents), config: sdkConfig(req) }),
      );
      for await (const chunk of stream) {
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (part.thought) continue;
          if (part.functionCall) {
            yield {
              functionCall: { name: part.functionCall.name ?? "", args: (part.functionCall.args ?? {}) as Record<string, unknown> },
              thoughtSignature: part.thoughtSignature,
            };
          } else if (typeof part.text === "string" && part.text) {
            yield { text: part.text };
          }
        }
      }
    },
  };
}

export function defaultDeps(ownerId: string): GatewayDeps {
  return {
    ...realDeps(),
    audit: async (rec) => {
      if (isDbConfigured()) await recordAudit(ownerId, rec);
    },
  };
}

// Convenience entry point: loads and decrypts the owner's Vault, audits to the database.
export async function askGemini(ownerId: string, req: Omit<GatewayRequest, "vault">): Promise<GatewayResult> {
  const vault = await listVault(ownerId);
  return sendThroughGateway({ ...req, vault }, defaultDeps(ownerId));
}

export { describeAiError };
