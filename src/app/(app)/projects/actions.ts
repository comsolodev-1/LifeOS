"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProject, deleteProject, projectInput, updateProject } from "@/lib/dal/projects";
import { AppError } from "@/lib/errors";
import { requireOwnerId } from "@/lib/session";

export type ProjectFormState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/projects", "layout");
  revalidatePath("/tasks");
}

export async function addProject(_prev: ProjectFormState, form: FormData): Promise<ProjectFormState> {
  const ownerId = await requireOwnerId();
  const parsed = projectInput.safeParse({ name: form.get("name"), status: "active" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await createProject(ownerId, parsed.data);
  refresh();
  return { ok: true };
}

export async function saveProject(_prev: ProjectFormState, form: FormData): Promise<ProjectFormState> {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  const parsed = projectInput.safeParse({ name: form.get("name"), status: form.get("status") });
  if (typeof id !== "string") return { error: "Invalid request" };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await updateProject(ownerId, id, parsed.data);
  } catch (e) {
    return { error: e instanceof AppError ? e.message : "Something went wrong. Try again." };
  }
  refresh();
  return { ok: true };
}

export async function removeProject(form: FormData) {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return;
  await deleteProject(ownerId, id);
  refresh();
  redirect("/projects");
}
