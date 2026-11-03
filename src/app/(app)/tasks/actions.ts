"use server";

import { revalidatePath } from "next/cache";
import { createTask, deleteTask, setTaskStatus, taskInput, taskStatus } from "@/lib/dal/tasks";
import { requireOwnerId } from "@/lib/session";

export type FormState = { error?: string; ok?: boolean };

function text(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function addTask(_prev: FormState, form: FormData): Promise<FormState> {
  const ownerId = await requireOwnerId();
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
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await createTask(ownerId, parsed.data);
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function changeStatus(form: FormData) {
  const ownerId = await requireOwnerId();
  const status = taskStatus.safeParse(form.get("status"));
  const id = form.get("id");
  if (!status.success || typeof id !== "string") return;
  await setTaskStatus(ownerId, id, status.data);
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function removeTask(form: FormData) {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return;
  await deleteTask(ownerId, id);
  revalidatePath("/tasks");
  revalidatePath("/");
}
