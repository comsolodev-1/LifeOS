"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eventInput, createEvent, createEventsSkippingDuplicates, deleteEvent, deleteEventsBySource, getOwnerTimezone, skipOccurrence, updateEvent, type EventInput } from "@/lib/dal/events";
import { buildImportInputs } from "@/lib/calendar/import";
import { isDateString, localDateString } from "@/lib/calendar/timezone";
import { AppError } from "@/lib/errors";
import { requireOwnerId } from "@/lib/session";

export type EventFormState = { error?: string; ok?: boolean; message?: string };

function msg(e: unknown) {
  return e instanceof AppError ? e.message : "Something went wrong. Try again.";
}

function text(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function parseEvent(form: FormData): { data?: EventInput; error?: string } {
  const repeat = text(form, "repeat") ?? "none";
  const count = text(form, "count");
  const interval = text(form, "interval");
  const weekdays = form.getAll("weekday").map((v) => Number(v)).filter((n) => Number.isInteger(n));
  const recurrence =
    repeat === "none"
      ? undefined
      : {
          freq: repeat,
          interval: interval ? Number(interval) : 1,
          byWeekday: repeat === "weekly" && weekdays.length ? weekdays : undefined,
          until: text(form, "until"),
          count: count ? Number(count) : undefined,
        };
  const input = {
    title: text(form, "title") ?? "",
    notes: text(form, "notes"),
    kind: text(form, "kind") ?? "event",
    date: text(form, "date") ?? "",
    startTime: text(form, "startTime") ?? "",
    endTime: text(form, "endTime") ?? "",
    recurrence,
  };
  const parsed = eventInput.safeParse(input);
  return parsed.success ? { data: input as EventInput } : { error: parsed.error.issues[0]?.message ?? "Invalid input" };
}

export async function addEvent(_prev: EventFormState, form: FormData): Promise<EventFormState> {
  const ownerId = await requireOwnerId();
  const { data, error } = parseEvent(form);
  if (!data) return { error };
  try {
    await createEvent(ownerId, data);
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect(`/calendar?view=week&date=${data.date}`);
}

export async function saveEvent(_prev: EventFormState, form: FormData): Promise<EventFormState> {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  const { data, error } = parseEvent(form);
  if (typeof id !== "string") return { error: "Invalid request" };
  if (!data) return { error };
  try {
    await updateEvent(ownerId, id, data);
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true, message: "Saved" };
}

export async function removeEvent(form: FormData) {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  if (typeof id !== "string") return;
  await deleteEvent(ownerId, id);
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect("/calendar");
}

export async function skipOne(form: FormData) {
  const ownerId = await requireOwnerId();
  const id = form.get("id");
  const date = form.get("date");
  if (typeof id !== "string" || typeof date !== "string") return;
  try {
    await skipOccurrence(ownerId, id, date);
  } catch {
    /* already gone or not repeating */
  }
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect("/calendar");
}

const importSchema = z.object({
  until: z.string().optional(),
  items: z
    .array(
      z.object({
        title: z.string(),
        days: z.array(z.number().int().min(0).max(6)).max(7),
        date: z.string(),
        startTime: z.string(),
        endTime: z.string(),
      }),
    )
    .min(1, "Select at least one event")
    .max(80),
});

// Saves only the events the owner reviewed and selected. Every row is validated again on the server.
export async function saveImported(_prev: EventFormState, form: FormData): Promise<EventFormState> {
  const ownerId = await requireOwnerId();
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { error: "Invalid request" };
  }
  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { until, items } = parsed.data;
  if (until && !isDateString(until)) return { error: "Repeat-until date is not valid" };

  const tz = await getOwnerTimezone(ownerId);
  const built = buildImportInputs(items, until, localDateString(new Date(), tz));
  if (!built.inputs) return { error: built.error };
  const inputs = built.inputs;
  let result;
  try {
    result = await createEventsSkippingDuplicates(ownerId, inputs, "photo");
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath("/calendar");
  revalidatePath("/");
  const { created, skipped } = result;
  return {
    ok: true,
    message: `Saved ${created} event${created === 1 ? "" : "s"} to your calendar.${skipped ? ` Skipped ${skipped} that were already there.` : ""}`,
  };
}

export async function removeImported() {
  const ownerId = await requireOwnerId();
  await deleteEventsBySource(ownerId, "photo");
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect("/calendar");
}
