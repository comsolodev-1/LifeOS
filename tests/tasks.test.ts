import { describe, expect, it } from "vitest";
import { taskId, taskInput, taskStatus } from "../src/lib/dal/tasks";

describe("taskInput", () => {
  it("trims and defaults priority", () => {
    const r = taskInput.parse({ title: "  Pay rent " });
    expect(r.title).toBe("Pay rent");
    expect(r.priority).toBe("medium");
  });
  it("rejects empty or oversized titles", () => {
    expect(taskInput.safeParse({ title: "   " }).success).toBe(false);
    expect(taskInput.safeParse({ title: "x".repeat(201) }).success).toBe(false);
  });
  it("rejects non-positive or fractional estimates", () => {
    expect(taskInput.safeParse({ title: "a", estimatedMinutes: 0 }).success).toBe(false);
    expect(taskInput.safeParse({ title: "a", estimatedMinutes: 1.5 }).success).toBe(false);
  });
  it("rejects unknown priority", () => {
    expect(taskInput.safeParse({ title: "a", priority: "urgent" }).success).toBe(false);
  });
});

describe("ids and status", () => {
  it("only accepts uuids", () => {
    expect(taskId.safeParse("1 or 1=1").success).toBe(false);
    expect(taskId.safeParse("3f2b8c1e-5d7a-4b9e-8c21-0a1b2c3d4e5f").success).toBe(true);
  });
  it("only accepts known statuses", () => {
    expect(taskStatus.safeParse("archived").success).toBe(false);
  });
});
