import { z } from "zod";
import { addDays, localDateString, startOfLocalDay, isDateString } from "@/lib/calendar/timezone";
import { conflictMap, occurrenceKey } from "@/lib/calendar/recurrence";
import { getOwnerTimezone, listOccurrences } from "@/lib/dal/events";
import { listProjects } from "@/lib/dal/projects";
import { listTasks } from "@/lib/dal/tasks";
import type { ToolDeclaration } from "@/lib/privacy/gateway";
import { AppError } from "@/lib/errors";
import { getLifeContext, listMemories, MEMORY_CATEGORIES, memoryInput, proposeMemory, retrieveMemories } from "./memory";
import { createPending, payloadSchemas, type PendingAction } from "./pending";

export const TOOLS: ToolDeclaration[] = [
  {
    name: "get_user_context",
    description: "Read the owner's saved life context (background, situation, routines).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_tasks",
    description: "Read the owner's tasks. Returns id, title, status, priority, deadline and project.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["todo", "doing", "done"] },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        search: { type: "string", description: "Words to look for in the task title" },
      },
    },
  },
  {
    name: "get_events",
    description: "Read the owner's calendar events between two dates (default: today and the next 14 days, at most 62 days). Marks overlapping events.",
    parameters: {
      type: "object",
      properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD, inclusive" } },
    },
  },
  { name: "get_projects", description: "Read the owner's projects with progress.", parameters: { type: "object", properties: {} } },
  {
    name: "search_memories",
    description: "Search the owner's approved memories by keywords.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "create_task",
    description: "PROPOSE a new task. The owner must confirm before it exists.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        notes: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        deadline: { type: "string", description: "YYYY-MM-DD" },
        estimatedMinutes: { type: "integer" },
        projectId: { type: "string", description: "Project id from get_projects" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "PROPOSE a change to an existing task (use an id from get_tasks). The owner must confirm.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        status: { type: "string", enum: ["todo", "doing", "done"] },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        deadline: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "create_project",
    description: "PROPOSE a new project. The owner must confirm.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "propose_memory",
    description: "PROPOSE saving a durable fact the owner stated (preference, routine, goal, constraint). Saved only if the owner approves.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...MEMORY_CATEGORIES] },
        content: { type: "string" },
        confidence: { type: "number", description: "0 to 1" },
      },
      required: ["category", "content"],
    },
  },
];

export interface ToolContext {
  ownerId: string;
  conversationId: string;
  turnId: string;
}

export type ToolUi = { kind: "action"; action: PendingAction } | { kind: "memory"; memory: { id: string; category: string; content: string } };

export interface ToolOutcome {
  response: Record<string, unknown>;
  ui?: ToolUi;
}

const day = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d) : null);
const PROPOSED = { status: "proposed", note: "Awaiting the owner's confirmation. Tell the owner it is only a suggestion until they confirm." };

// No tool can run arbitrary SQL. Read tools are owner-scoped DAL calls; write tools only create suggestions.
export async function executeTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "get_user_context":
        return { response: { lifeContext: (await getLifeContext(ctx.ownerId)) || "(empty)" } };
      case "get_tasks": {
        const a = z.object({ status: z.string().optional(), priority: z.string().optional(), search: z.string().optional() }).parse(args);
        const rows = (await listTasks(ctx.ownerId, a)).slice(0, 40);
        return {
          response: {
            tasks: rows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, deadline: day(t.deadline), project: t.projectName })),
          },
        };
      }
      case "get_events": {
        const a = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(args);
        const tz = await getOwnerTimezone(ctx.ownerId);
        const from = a.from && isDateString(a.from) ? a.from : localDateString(new Date(), tz);
        let to = a.to && isDateString(a.to) ? a.to : addDays(from, 14);
        if (to < from) to = from;
        if (to > addDays(from, 62)) to = addDays(from, 62);
        const occs = await listOccurrences(ctx.ownerId, startOfLocalDay(from, tz), startOfLocalDay(addDays(to, 1), tz));
        const clashes = conflictMap(occs);
        const time = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
        return {
          response: {
            timezone: tz,
            events: occs.slice(0, 80).map((o) => ({
              title: o.title, date: localDateString(o.start, tz), start: time(o.start), end: time(o.end), repeats: o.recurring,
              overlapsWith: (clashes.get(occurrenceKey(o)) ?? []).map((c) => c.title),
            })),
          },
        };
      }
      case "get_projects": {
        const rows = await listProjects(ctx.ownerId);
        return { response: { projects: rows.map((p) => ({ id: p.id, name: p.name, status: p.status, tasksDone: p.done, tasksTotal: p.total })) } };
      }
      case "search_memories": {
        const { query } = z.object({ query: z.string().max(200) }).parse(args);
        const found = retrieveMemories(await listMemories(ctx.ownerId, "approved"), query, 8, 0);
        return { response: { memories: found.map((m) => ({ category: m.category, content: m.content })) } };
      }
      case "create_task":
      case "update_task":
      case "create_project": {
        const payload = payloadSchemas[name].parse(args);
        const action = await createPending(ctx.ownerId, ctx.conversationId, ctx.turnId, name, payload);
        return { response: { ...PROPOSED, suggestionId: action.id }, ui: { kind: "action", action } };
      }
      case "propose_memory": {
        const data = memoryInput.parse(args);
        const m = await proposeMemory(ctx.ownerId, data, ctx.conversationId);
        return { response: PROPOSED, ui: { kind: "memory", memory: { id: m.id, category: m.category, content: m.content } } };
      }
      default:
        return { response: { error: `Unknown tool: ${name}` } };
    }
  } catch (error) {
    if (error instanceof z.ZodError) return { response: { error: `Invalid arguments: ${error.issues[0]?.message ?? "check the values"}` } };
    if (error instanceof AppError) return { response: { error: error.message } };
    return { response: { error: "The tool failed. Do not retry; tell the owner." } };
  }
}
