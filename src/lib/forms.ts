import { taskInput, type TaskInput } from "@/lib/dal/tasks";

export function text(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

// Dates are entered as calendar days and interpreted as end of day in Asia/Manila (UTC+8, no DST).
export function parseTaskForm(form: FormData): { data?: TaskInput; error?: string } {
  const deadlineRaw = text(form, "deadline");
  const minutesRaw = text(form, "estimatedMinutes");
  const deadline = deadlineRaw ? new Date(`${deadlineRaw}T23:59:00+08:00`) : undefined;
  if (deadline && Number.isNaN(deadline.getTime())) return { error: "Invalid deadline" };
  const parsed = taskInput.safeParse({
    title: text(form, "title") ?? "",
    notes: text(form, "notes"),
    priority: text(form, "priority") ?? "medium",
    deadline,
    estimatedMinutes: minutesRaw ? Number(minutesRaw) : undefined,
    projectId: text(form, "projectId"),
  });
  return parsed.success ? { data: parsed.data } : { error: parsed.error.issues[0]?.message ?? "Invalid input" };
}

export function dateInputValue(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
}
