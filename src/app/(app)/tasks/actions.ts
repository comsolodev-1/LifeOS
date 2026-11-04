"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDependency, createTask, deleteTask, removeDependency, setTaskStatus, taskStatus, updateTask } from "@/lib/dal/tasks";
import { AppError } from "@/lib/errors";
import { parseTaskForm } from "@/lib/forms";
import { requireOwnerId } from "@/lib/session";

export type FormState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/projects", "layout");
  revalidatePath("/");
}

function message(error: unknown): string {
  return error instanceof AppError ? error.message : "Something went wrong. Try again.";
}

export async function addTask(_prev: FormState, form: FormData): Promise<FormState> {
  const ownerId = await requireOwnerId();
  const { data, error } = parseTaskForm(form);
  if (!data) return { error };
  try {
    await createTask(ownerId, data);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return { ok: true };
}

export async function saveTask(_prev: FormState, form: FormData): Promise<FormState> {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  const status = taskStatus.safeParse(form.get("status"));
  const { data, error } = parseTaskForm(form);
  if (typeof id !== "string" || !status.success) return { error: "Invalid request" };
  if (!data) return { error };
  try {
    await updateTask(ownerId, id, { ...data, status: status.data });
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  return { ok: true };
}

export async function changeStatus(form: FormData) {
  const ownerId = await requireOwnerId();
  const status = taskStatus.safeParse(form.get("status"));
  const id = form.get("id");
  if (!status.success || typeof id !== "string") return;
  await setTaskStatus(ownerId, id, status.data);
  refresh();
}

export async function removeTask(form: FormData) {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return;
  await deleteTask(ownerId, id);
  refresh();
  if (form.get("redirect") === "1") redirect("/tasks");
}

export async function addBlocker(_prev: FormState, form: FormData): Promise<FormState> {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  const dependsOn = form.get("dependsOn");
  if (typeof id !== "string" || typeof dependsOn !== "string" || !dependsOn) return { error: "Pick a task" };
  try {
    await addDependency(ownerId, id, dependsOn);
  } catch (e) {
    return { error: message(e) };
  }
  refresh();
  revalidatePath(`/tasks/${id}`);
  return { ok: true };
}

export async function dropBlocker(form: FormData) {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  const dependsOn = form.get("dependsOn");
  if (typeof id !== "string" || typeof dependsOn !== "string") return;
  await removeDependency(ownerId, id, dependsOn);
  refresh();
  revalidatePath(`/tasks/${id}`);
}
