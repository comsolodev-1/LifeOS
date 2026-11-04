import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

process.env.VAULT_KEY = randomBytes(32).toString("base64");

import { __setDbForTests, getDb } from "../src/db";
import * as schema from "../src/db/schema";
import { runAssistantTurn, type ChatEvent } from "../src/lib/ai/assistant";
import { listMessages } from "../src/lib/ai/conversations";
import { addManualMemory, listMemories, proposeMemory, retrieveMemories, setMemoryStatus, type Memory } from "../src/lib/ai/memory";
import { confirmPending, createPending, dismissPending, listPending } from "../src/lib/ai/pending";
import { listTasks, createTask } from "../src/lib/dal/tasks";
import type { GatewayDeps, PreparedRequest, StreamChunk } from "../src/lib/privacy/gateway";
import { StreamRehydrator } from "../src/lib/privacy/stream";
import { TokenMap } from "../src/lib/privacy/tokens";
import { addVaultEntry } from "../src/lib/privacy/vault";

let A: string;
let B: string;

beforeAll(async () => {
  const client = new PGlite();
  for (const f of readdirSync("drizzle").filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(path.join("drizzle", f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await client.exec(stmt);
  }
  const db = drizzle(client, { schema });
  __setDbForTests(db);
  const [a, b] = await db.insert(schema.profiles).values([{ email: "a@example.com" }, { email: "b@example.com" }]).returning();
  A = a.id;
  B = b.id;
  await addVaultEntry(A, { type: "person", value: "Maria Santos", aliases: ["Ate Mia"] });
});

function scripted(rounds: StreamChunk[][]) {
  const calls: PreparedRequest[] = [];
  let i = 0;
  const deps: GatewayDeps = {
    generate: async () => "",
    audit: async () => {},
    async *generateStream(req) {
      calls.push(req);
      for (const c of rounds[Math.min(i++, rounds.length - 1)]) yield c;
    },
  };
  return { calls, deps };
}

async function turn(owner: string, text: string, deps: GatewayDeps, conversationId?: string) {
  const events: ChatEvent[] = [];
  await runAssistantTurn(owner, { text, conversationId }, deps, (e) => events.push(e));
  const meta = events.find((e) => e.type === "meta") as { conversationId: string } | undefined;
  return { events, conversationId: meta?.conversationId };
}

const outbound = (calls: PreparedRequest[]) => JSON.stringify(calls.map((c) => [c.system, c.contents]));

describe("assistant turn", () => {
  it("proposes, never writes directly, protects names, and replays the thought signature", async () => {
    const { calls, deps } = scripted([
      [{ text: "Sure. " }, { functionCall: { name: "create_task", args: { title: "Call [PERSON_1]", deadline: "2030-01-05" } }, thoughtSignature: "sig-123" }],
      [{ text: "I proposed a task for [PERSON_" }, { text: "1]. Please confirm." }],
    ]);
    const { events, conversationId } = await turn(A, "Remind me to call Maria Santos on 2030-01-05", deps);

    expect(outbound(calls)).not.toMatch(/Maria|Santos/);
    expect(await listTasks(A, { search: "Call" })).toEqual([]);

    const suggestion = events.find((e) => e.type === "suggestion") as Extract<ChatEvent, { type: "suggestion" }>;
    expect(suggestion.ui.kind).toBe("action");
    if (suggestion.ui.kind === "action") expect(suggestion.ui.action.payload).toMatchObject({ title: "Call Maria Santos", deadline: "2030-01-05" });

    const secondCall = JSON.stringify(calls[1].contents);
    expect(secondCall).toContain("sig-123");
    expect(secondCall).toContain("suggestionId");

    const streamed = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(streamed).toBe("Sure. I proposed a task for Maria Santos. Please confirm.");
    const saved = await listMessages(A, conversationId as string);
    expect(saved.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(saved[1].content).toBe("Sure. I proposed a task for Maria Santos. Please confirm.");

    const [pending] = await listPending(A, conversationId);
    const first = await confirmPending(A, pending.id);
    const second = await confirmPending(A, pending.id);
    expect(first.already).toBe(false);
    expect(second).toEqual({ ref: first.ref, already: true });
    const tasks = await listTasks(A, { search: "Call Maria" });
    expect(tasks.length).toBe(1);
    expect(tasks[0].origin).toBe("manual");
    expect(tasks[0].deadline?.toISOString()).toBe("2030-01-05T15:59:00.000Z");
  });

  it("applies owner edits when confirming", async () => {
    const { deps } = scripted([[{ functionCall: { name: "create_task", args: { title: "Draft thesis outline" } } }], [{ text: "ok" }]]);
    const { conversationId } = await turn(A, "add a task to draft my thesis outline", deps);
    const [p] = await listPending(A, conversationId);
    await confirmPending(A, p.id, { title: "Draft thesis chapter 1", priority: "high" });
    const t = (await listTasks(A, { search: "chapter 1" }))[0];
    expect(t).toMatchObject({ title: "Draft thesis chapter 1", priority: "high" });
  });

  it("sanitizes tool results before they go back to the model", async () => {
    await createTask(A, { title: "Email Maria Santos the draft", priority: "medium" });
    const { calls, deps } = scripted([[{ functionCall: { name: "get_tasks", args: {} } }], [{ text: "You have a task for [PERSON_1]." }]]);
    const { events } = await turn(A, "what do I have to do?", deps);
    expect(JSON.stringify(calls[1].contents)).toContain("functionResponse");
    expect(outbound(calls)).not.toMatch(/Maria|Santos/);
    expect(events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toBe("You have a task for Maria Santos.");
  });

  it("returns tool errors to the model instead of writing anything", async () => {
    const before = (await listPending(A)).length;
    const { calls, deps } = scripted([
      [{ functionCall: { name: "create_task", args: { title: "", priority: "urgent" } } }, { functionCall: { name: "drop_database", args: {} } }],
      [{ text: "Sorry, that failed." }],
    ]);
    await turn(A, "do something odd", deps);
    expect(JSON.stringify(calls[1].contents)).toContain("Invalid arguments");
    expect(JSON.stringify(calls[1].contents)).toContain("Unknown tool");
    expect((await listPending(A)).length).toBe(before);
  });

  it("blocks secrets and oversized or unknown-conversation requests without calling the model", async () => {
    const { calls, deps } = scripted([[{ text: "hi" }]]);
    const secret = await turn(A, "my password is hunter2, remember it", deps);
    expect(secret.events.some((e) => e.type === "error" && /secret/i.test(e.message))).toBe(true);
    const long = await turn(A, "x".repeat(4001), deps);
    expect(long.events.some((e) => e.type === "error")).toBe(true);
    const missing = await turn(A, "hello", deps, "3f2b8c1e-5d7a-4b9e-8c21-0a1b2c3d4e5f");
    expect(missing.events.some((e) => e.type === "error")).toBe(true);
    expect(calls.length).toBe(0);
  });

  it("does not let another owner use a conversation", async () => {
    const { deps } = scripted([[{ text: "hello" }]]);
    const { conversationId } = await turn(A, "private chat", deps);
    const other = await turn(B, "hi", deps, conversationId);
    expect(other.events.some((e) => e.type === "error")).toBe(true);
    expect(await listMessages(B, conversationId as string)).toEqual([]);
  });
});

describe("pending actions", () => {
  async function makeAction(owner = A) {
    const { deps } = scripted([[{ text: "ok" }]]);
    const { conversationId } = await turn(owner, "hello", deps);
    const turnId = crypto.randomUUID();
    const action = await createPending(owner, conversationId as string, turnId, "create_task", { title: "Pending thing" });
    return { action, conversationId: conversationId as string, turnId };
  }

  it("is idempotent for a retried turn", async () => {
    const { action, conversationId, turnId } = await makeAction();
    const again = await createPending(A, conversationId, turnId, "create_task", { title: "Pending thing" });
    expect(again.id).toBe(action.id);
  });

  it("cannot be confirmed or dismissed by another owner", async () => {
    const { action } = await makeAction();
    await expect(confirmPending(B, action.id)).rejects.toThrow();
    await dismissPending(B, action.id);
    expect((await listPending(A)).map((p) => p.id)).toContain(action.id);
    expect((await listPending(B)).length).toBe(0);
  });

  it("cannot be confirmed after dismissal or expiry", async () => {
    const one = await makeAction();
    await dismissPending(A, one.action.id);
    await expect(confirmPending(A, one.action.id)).rejects.toThrow(/no longer available/);
    const two = await makeAction();
    await getDb().update(schema.pendingActions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.pendingActions.id, two.action.id));
    await expect(confirmPending(A, two.action.id)).rejects.toThrow(/no longer available/);
  });

  it("refuses to update another owner's task and stays retryable", async () => {
    const [bTask] = await createTask(B, { title: "B's private task", priority: "low" });
    const { conversationId } = await makeAction();
    const action = await createPending(A, conversationId, crypto.randomUUID(), "update_task", { taskId: bTask.id, title: "hijacked" });
    await expect(confirmPending(A, action.id)).rejects.toThrow();
    expect((await listTasks(B, { search: "private" }))[0].title).toBe("B's private task");
    expect((await listPending(A)).map((p) => p.id)).toContain(action.id);
  });
});

describe("memory", () => {
  it("proposed memories are not used until approved, then appear in a new conversation", async () => {
    const m = await proposeMemory(A, { category: "preferences", content: "Prefers studying late at night", confidence: 0.8 });
    const first = scripted([[{ functionCall: { name: "propose_memory", args: { category: "routines", content: "Gym on Saturday mornings" } } }], [{ text: "Noted as a suggestion." }]]);
    const { events } = await turn(A, "I go to the gym every Saturday morning", first.deps);
    expect(events.some((e) => e.type === "suggestion" && e.ui.kind === "memory")).toBe(true);
    expect((await listMemories(A, "proposed")).length).toBeGreaterThanOrEqual(2);

    const before = scripted([[{ text: "ok" }]]);
    await turn(A, "when should I study at night?", before.deps);
    expect(before.calls[0].system).not.toContain("studying late at night");

    await setMemoryStatus(A, m.id, "approved");
    const after = scripted([[{ text: "ok" }]]);
    await turn(A, "when should I study at night?", after.deps);
    expect(after.calls[0].system).toContain("Prefers studying late at night");
    expect(after.calls[0].system).not.toContain("Gym on Saturday");
  });

  it("isolates memories per owner", async () => {
    expect((await listMemories(B)).length).toBe(0);
    await expect(setMemoryStatus(B, (await listMemories(A))[0].id, "approved")).rejects.toThrow();
  });

  it("retrieves by keyword with a recent fallback", () => {
    const mk = (id: string, content: string, status: Memory["status"] = "approved", day = 1): Memory => ({
      id, category: "other", content, confidence: 1, source: "manual", status, lastVerifiedAt: null, createdAt: new Date(2026, 0, day),
    });
    const all = [mk("a", "Studies at night"), mk("b", "Allergic to nothing, likes basketball"), mk("c", "Plays basketball on Sundays", "approved", 2), mk("d", "basketball secret", "proposed")];
    expect(retrieveMemories(all, "basketball plans", 8, 0).map((m) => m.id)).toEqual(["c", "b"]);
    expect(retrieveMemories(all, "zzz", 8, 0)).toEqual([]);
    expect(retrieveMemories(all, "zzz", 8, 2).length).toBe(2);
    expect(retrieveMemories(all, "basketball", 1, 0).length).toBe(1);
  });

  it("manual memories are approved immediately", async () => {
    const m = await addManualMemory(A, { category: "identity", content: "Lives in Camarines Norte" });
    expect(m.status).toBe("approved");
  });
});

describe("StreamRehydrator", () => {
  const map = TokenMap.fromEntries([["[PERSON_1]", "Maria Santos"], ["[OWNER]", "Juan"]]);
  const run = (chunks: string[]) => {
    const r = new StreamRehydrator(map);
    return chunks.map((c) => r.push(c)).join("") + r.flush();
  };
  it("never emits half a token", () => {
    const r = new StreamRehydrator(map);
    expect(r.push("Hi [PERS")).toBe("Hi ");
    expect(r.push("ON_1], from [OW")).toBe("Maria Santos, from ");
    expect(r.push("NER]!")).toBe("Juan!");
  });
  it("matches non-streaming output for any split point", () => {
    const text = "Call [PERSON_1] and tell [OWNER] about [PERSON_9] ok [not a token] [";
    const expected = "Call Maria Santos and tell Juan about [PERSON_9] ok [not a token] [";
    for (let i = 0; i <= text.length; i++) expect(run([text.slice(0, i), text.slice(i)])).toBe(expected);
    expect(run([...text])).toBe(expected);
  });
});
