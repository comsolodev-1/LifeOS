import { describe, expect, it, vi } from "vitest";
import { GatewayError, sendThroughGateway, type GatewayDeps, type GatewayRequest } from "../src/lib/privacy/gateway";
import { egressCheck } from "../src/lib/privacy/egress";
import { rehydrateDeep, rehydrateText } from "../src/lib/privacy/rehydrate";
import { sanitizeText } from "../src/lib/privacy/sanitize";
import { TokenMap } from "../src/lib/privacy/tokens";
import { NOW, VAULT } from "./helpers";

function setup(reply: string | ((payload: string) => string) = "ok") {
  const sent: string[] = [];
  const audits: { blocked: boolean; blockReason?: string; sanitizedPayload: string }[] = [];
  const generate = vi.fn(async (r: { system: string; contents: { text: string }[] }) => {
    const payload = [r.system, ...r.contents.map((c) => c.text)].join("\n");
    sent.push(payload);
    return typeof reply === "function" ? reply(payload) : reply;
  });
  const deps: GatewayDeps = {
    generate,
    audit: async (rec) => void audits.push(rec),
    sanitize: (t, o) => sanitizeText(t, { ...o, now: NOW }),
  };
  const base = (messages: GatewayRequest["messages"], extra: Partial<GatewayRequest> = {}): GatewayRequest => ({
    purpose: "test", messages, vault: VAULT, tokenMap: new TokenMap(), ...extra,
  });
  return { sent, audits, generate, deps, base };
}

describe("gateway", () => {
  it("sends sanitized text and rehydrates the reply on the server", async () => {
    const { sent, deps, base } = setup("Sure. I will email [PERSON_1] at [EMAIL_1] from [OWNER].");
    const res = await sendThroughGateway(
      base([{ role: "user", text: "Email Maria Santos at maria@example.com. I am Juan Dela Cruz." }]),
      deps,
    );
    expect(sent[0]).not.toMatch(/Maria|maria@example|Juan|Cruz/i);
    expect(sent[0]).toContain("[PERSON_1]");
    expect(res.text).toBe("Sure. I will email Maria Santos at maria@example.com from Juan Miguel Dela Cruz.");
    expect(res.unresolved).toEqual([]);
  });

  it("sanitizes tool results and system text too", async () => {
    const { sent, deps, base } = setup();
    await sendThroughGateway(
      base([{ role: "user", text: "Summarize", source: "user" }, { role: "user", text: "Tool result: Maria Santos phone 0917 555 1234, CNSC", source: "tool" }], {
        system: "The owner is Juan Miguel Dela Cruz",
      }),
      deps,
    );
    expect(sent[0]).not.toMatch(/Maria|0917|CNSC|Juan/i);
  });

  it("includes the placeholder instructions", async () => {
    const { sent, deps, base } = setup();
    await sendThroughGateway(base([{ role: "user", text: "hi" }]), deps);
    expect(sent[0]).toContain("opaque placeholder");
    expect(sent[0]).toContain("generic");
  });

  it("blocks secrets, never calls the model, and audits without the secret", async () => {
    const { generate, audits, deps, base } = setup();
    const err = await sendThroughGateway(base([{ role: "user", text: "my password is hunter2" }]), deps).catch((e) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.reason).toBe("secret");
    expect(generate).not.toHaveBeenCalled();
    expect(audits[0].blocked).toBe(true);
    expect(audits[0].sanitizedPayload).not.toContain("hunter2");
  });

  it("fails closed when sanitization throws", async () => {
    const { generate, deps, base } = setup();
    deps.sanitize = () => { throw new Error("boom"); };
    const err = await sendThroughGateway(base([{ role: "user", text: "hello" }]), deps).catch((e) => e);
    expect(err.reason).toBe("sanitization_failed");
    expect(generate).not.toHaveBeenCalled();
  });

  it("fails closed when a detector throws", async () => {
    const { generate, deps, base } = setup();
    deps.sanitize = (t, o) => sanitizeText(t, { ...o, detect: () => { throw new Error("detector down"); } });
    const err = await sendThroughGateway(base([{ role: "user", text: "hello" }]), deps).catch((e) => e);
    expect(err.reason).toBe("sanitization_failed");
    expect(generate).not.toHaveBeenCalled();
  });

  it("fails closed when the egress guard throws", async () => {
    const { generate, deps, base } = setup();
    deps.egress = () => { throw new Error("guard down"); };
    const err = await sendThroughGateway(base([{ role: "user", text: "hello" }]), deps).catch((e) => e);
    expect(err.reason).toBe("sanitization_failed");
    expect(generate).not.toHaveBeenCalled();
  });

  it("egress guard blocks a Vault value the sanitizer missed", async () => {
    const { generate, audits, deps, base } = setup();
    deps.sanitize = (t) => ({ text: t, report: { counts: {}, secrets: [], possible: [] } });
    const err = await sendThroughGateway(base([{ role: "user", text: "Tell Maria Santos hello" }]), deps).catch((e) => e);
    expect(err.reason).toBe("egress");
    expect(err.message).not.toContain("Maria");
    expect(generate).not.toHaveBeenCalled();
    expect(audits[0].sanitizedPayload).toBe("");
  });

  it("flags unresolved tokens in the model reply instead of guessing", async () => {
    const { deps, base } = setup("Ask [PERSON_9] and [person_1] and [PERSON_1]");
    const res = await sendThroughGateway(base([{ role: "user", text: "Maria Santos" }]), deps);
    expect(res.text).toBe("Ask [PERSON_9] and [person_1] and Maria Santos");
    expect(res.unresolved.sort()).toEqual(["[PERSON_9]", "[person_1]"]);
  });
});

describe("egressCheck", () => {
  it("passes clean sanitized text and catches leaks", () => {
    expect(egressCheck("Plan for [PERSON_1] at [EMAIL_1], salary [AMOUNT 10k-100k], (age: late 20s)", VAULT).ok).toBe(true);
    expect(egressCheck("call 0917 555 1234", VAULT).hits.map((h) => h.type)).toContain("phone");
    expect(egressCheck("maria_santos", VAULT).hits.map((h) => h.type)).toContain("vault_person");
    expect(egressCheck("ask MIGS", VAULT).hits.map((h) => h.type)).toContain("vault_owner");
  });
  it("does not flag short aliases inside longer words", () => {
    expect(egressCheck("the cnscx project", VAULT).ok).toBe(true);
  });
});

describe("rehydration", () => {
  const map = TokenMap.fromEntries([["[PERSON_1]", "Maria Santos"], ["[OWNER]", "Juan"]]);
  it("round-trips text", () => {
    expect(rehydrateText("Hi [PERSON_1], from [OWNER]", map).value).toBe("Hi Maria Santos, from Juan");
  });
  it("round-trips nested tool arguments and leaves keys alone", () => {
    const r = rehydrateDeep({ title: "Call [PERSON_1]", tags: ["[OWNER]", "x"], "[PERSON_1]": 1, n: 3 }, map);
    expect(r.value).toEqual({ title: "Call Maria Santos", tags: ["Juan", "x"], "[PERSON_1]": 1, n: 3 });
    expect(r.unresolved).toEqual([]);
  });
  it("handles tampered tokens", () => {
    const r = rehydrateText("[person_1] PERSON_1 [PERSON_1 [PERSON_01] [PERSON_2] [PERSON_1]", map);
    expect(r.value).toBe("[person_1] PERSON_1 [PERSON_1 [PERSON_01] [PERSON_2] Maria Santos");
    expect(r.unresolved).toEqual(["[person_1]", "[PERSON_01]", "[PERSON_2]"]);
  });
  it("restores a serialized map", () => {
    const m = new TokenMap();
    const t = m.tokenFor("PERSON", "Maria Santos");
    const restored = TokenMap.fromEntries(m.entries());
    expect(restored.resolve(t)).toBe("Maria Santos");
    expect(restored.tokenFor("PERSON", "maria santos")).toBe(t);
    expect(restored.tokenFor("PERSON", "Someone Else")).toBe("[PERSON_2]");
  });
});

describe("property: no Vault value ever leaves in an outbound payload", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const names = ["Ana Lopez", "Ramon Bautista", "Liza Mercado", "Carlo Villanueva", "Nena Dizon", "Bong Aquino", "Tessa Quiambao", "Roel Tolentino"];
  const vault = names.map((v, i) => ({ id: String(i), type: "person" as const, value: v, aliases: [] }));
  const vary = (v: string) => {
    const s = pick([
      (x: string) => x, (x: string) => x.toUpperCase(), (x: string) => x.toLowerCase(),
      (x: string) => x.replace(" ", "  "), (x: string) => x.replace(" ", "-"), (x: string) => x.replace(" ", "_"), (x: string) => x.replace(" ", ""),
    ]);
    return s(v);
  };
  const templates = [(n: string) => `Remind me to call ${n} tomorrow`, (n: string) => `${n}, again: ${n}!`, (n: string) => `(${n}) said hi`, (n: string) => `email from ${n}.`];

  it("holds across 300 random payloads", async () => {
    for (let i = 0; i < 300; i++) {
      const picked = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(names));
      const text = picked.map((n) => pick(templates)(vary(n))).join(" and ");
      const sent: string[] = [];
      await sendThroughGateway(
        { purpose: "prop", messages: [{ role: "user", text }], vault, tokenMap: new TokenMap() },
        { generate: async (r) => { sent.push([r.system, ...r.contents.map((c) => c.text)].join("\n")); return "ok"; }, audit: async () => {} },
      );
      const flat = sent[0].toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const n of names) expect(flat).not.toContain(n.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
  });
});
