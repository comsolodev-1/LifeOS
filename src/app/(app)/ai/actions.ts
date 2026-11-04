"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteConversation } from "@/lib/ai/conversations";
import { setMemoryStatus, updateMemory, type MemoryCategory } from "@/lib/ai/memory";
import { confirmPending, dismissPending } from "@/lib/ai/pending";
import { AppError } from "@/lib/errors";
import { requireOwnerId } from "@/lib/session";

export type CardState = { ok?: boolean; error?: string; message?: string };

function msg(e: unknown) {
  return e instanceof AppError ? e.message : "Something went wrong. Try again.";
}

const EDITABLE = ["title", "name", "priority", "deadline", "status", "notes"] as const;

export async function confirmSuggestion(_prev: CardState, form: FormData): Promise<CardState> {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return { error: "Invalid request" };
  const overrides: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    const v = form.get(key);
    if (typeof v === "string" && v.trim() !== "") overrides[key] = v.trim();
  }
  try {
    await confirmPending(ownerId, id, overrides);
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath("/tasks");
  revalidatePath("/projects", "layout");
  revalidatePath("/");
  return { ok: true, message: "Done. It is now in your records." };
}

export async function dismissSuggestion(_prev: CardState, form: FormData): Promise<CardState> {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return { error: "Invalid request" };
  await dismissPending(ownerId, id);
  return { ok: true, message: "Dismissed." };
}

export async function approveMemory(_prev: CardState, form: FormData): Promise<CardState> {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  const content = form.get("content");
  const category = form.get("category");
  if (typeof id !== "string") return { error: "Invalid request" };
  try {
    if (typeof content === "string" && typeof category === "string") {
      await updateMemory(ownerId, id, { category: category as MemoryCategory, content });
    }
    await setMemoryStatus(ownerId, id, "approved");
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath("/profile");
  return { ok: true, message: "Saved to memory." };
}

export async function rejectMemory(_prev: CardState, form: FormData): Promise<CardState> {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return { error: "Invalid request" };
  try {
    await setMemoryStatus(ownerId, id, "rejected");
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath("/profile");
  return { ok: true, message: "Rejected." };
}

export async function removeChat(form: FormData) {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return;
  await deleteConversation(ownerId, id);
  revalidatePath("/ai");
  redirect("/ai");
}
