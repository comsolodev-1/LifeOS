import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import { localDateString } from "@/lib/calendar/timezone";
import { getOwnerTimezone } from "@/lib/dal/events";
import { requireOwnerId } from "@/lib/session";
import { EventForm } from "../event-form";

export default async function NewEventPage() {
  let today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (isDbConfigured()) {
    try {
      today = localDateString(new Date(), await getOwnerTimezone(await requireOwnerId()));
    } catch {
      /* keep the Manila default */
    }
  }
  return (
    <>
      <Link href="/calendar" className="mb-3 inline-block text-sm text-accent">Back to calendar</Link>
      <PageHeader title="Add event" />
      <EventForm defaults={{ title: "", notes: "", kind: "event", date: today, startTime: "09:00", endTime: "10:00", repeat: "none", interval: 1, weekdays: [], until: "", count: "" }} />
    </>
  );
}
