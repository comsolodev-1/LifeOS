"use client";

import { useActionState, useState } from "react";
import { addEvent, saveEvent, type EventFormState } from "./actions";

const field = "min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-base";
const WEEKDAYS = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"],
] as const;

export interface EventDefaults {
  id?: string;
  title: string;
  notes: string;
  kind: string;
  date: string;
  startTime: string;
  endTime: string;
  repeat: string;
  interval: number;
  weekdays: number[];
  until: string;
  count: string;
}

export function EventForm({ defaults }: { defaults: EventDefaults }) {
  const editing = Boolean(defaults.id);
  const [state, action, pending] = useActionState<EventFormState, FormData>(editing ? saveEvent : addEvent, {});
  const [repeat, setRepeat] = useState(defaults.repeat);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <label className="block text-sm">Title
        <input name="title" required maxLength={200} defaultValue={defaults.title} className={`${field} mt-1`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block text-sm">Date
          <input name="date" type="date" required defaultValue={defaults.date} className={`${field} mt-1`} />
        </label>
        <label className="block text-sm">Start
          <input name="startTime" type="time" required defaultValue={defaults.startTime} className={`${field} mt-1`} />
        </label>
        <label className="block text-sm">End
          <input name="endTime" type="time" required defaultValue={defaults.endTime} className={`${field} mt-1`} />
        </label>
        <label className="block text-sm">Type
          <select name="kind" defaultValue={defaults.kind} className={`${field} mt-1`}>
            <option value="event">Event</option>
            <option value="fixed">Fixed commitment</option>
          </select>
        </label>
        <label className="block text-sm">Repeats
          <select name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={`${field} mt-1`}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>
      {repeat !== "none" ? (
        <div className="space-y-3 rounded-lg border border-line p-3">
          <label className="block text-sm">Every how many {repeat === "daily" ? "days" : repeat === "weekly" ? "weeks" : "months"}
            <input name="interval" type="number" min={1} max={52} defaultValue={defaults.interval} className={`${field} mt-1`} />
          </label>
          {repeat === "weekly" ? (
            <fieldset>
              <legend className="mb-1 text-sm">On these days (blank means the same weekday as the date)</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(([n, label]) => (
                  <label key={n} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm">
                    <input type="checkbox" name="weekday" value={n} defaultChecked={defaults.weekdays.includes(n)} /> {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Ends on (optional)
              <input name="until" type="date" defaultValue={defaults.until} className={`${field} mt-1`} />
            </label>
            <label className="block text-sm">or after N times
              <input name="count" type="number" min={1} max={1000} defaultValue={defaults.count} className={`${field} mt-1`} />
            </label>
          </div>
        </div>
      ) : null}
      <label className="block text-sm">Notes
        <textarea name="notes" maxLength={2000} rows={2} defaultValue={defaults.notes} className={`${field} mt-1 py-2`} />
      </label>
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm text-green-600">{state.message}</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper disabled:opacity-60">
        {pending ? "Saving..." : editing ? "Save changes" : "Add event"}
      </button>
    </form>
  );
}
