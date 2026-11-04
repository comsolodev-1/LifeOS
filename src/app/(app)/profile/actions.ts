"use server";

import { revalidatePath } from "next/cache";
import { addManualMemory, deleteMemory, MEMORY_CATEGORIES, setLifeContext, updateMemory, type MemoryCategory } from "@/lib/ai/memory";
import { AppError } from "@/lib/errors";
import { requireOwnerId } from "@/lib/session";

export type ProfileState = { ok?: boolean; error?: string };

const fail = (e: unknown): ProfileState => ({ error: e instanceof AppError ? e.message : e instanceof Error && e.name === "ZodError" ? "Check the values and try again." : "Something went wrong. Try again." });

export async function saveLifeContext(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const ownerId = await requireOwnerId();
  try {
    await setLifeContext(ownerId, String(form.get("content") ?? ""));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/profile");
  return { ok: true };
}

function category(form: FormData): MemoryCategory {
  const v = String(form.get("category"));
  return (MEMORY_CATEGORIES as readonly string[]).includes(v) ? (v as MemoryCategory) : "other";
}

export async function addMemory(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const ownerId = await requireOwnerId();
  try {
    await addManualMemory(ownerId, { category: category(form), content: String(form.get("content") ?? "") });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/profile");
  return { ok: true };
}

export async function saveMemory(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return { error: "Invalid request" };
  try {
    await updateMemory(ownerId, id, { category: category(form), content: String(form.get("content") ?? "") });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/profile");
  return { ok: true };
}

export async function removeMemory(form: FormData) {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return;
  await deleteMemory(ownerId, id);
  revalidatePath("/profile");
}
