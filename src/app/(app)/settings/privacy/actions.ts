"use server";

import { revalidatePath } from "next/cache";
import { addVaultEntry, deleteVaultEntry, vaultInput } from "@/lib/privacy/vault";
import { requireOwnerId } from "@/lib/session";

export type VaultFormState = { error?: string; ok?: boolean };

export async function addEntry(_prev: VaultFormState, form: FormData): Promise<VaultFormState> {
  const ownerId = await requireOwnerId();
  const aliases = String(form.get("aliases") ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const parsed = vaultInput.safeParse({ type: form.get("type"), value: form.get("value"), aliases });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await addVaultEntry(ownerId, parsed.data);
  } catch {
    return { error: "Could not save. Check that VAULT_KEY is set correctly." };
  }
  revalidatePath("/settings/privacy");
  return { ok: true };
}

export async function removeEntry(form: FormData) {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return;
  await deleteVaultEntry(ownerId, id);
  revalidatePath("/settings/privacy");
}
