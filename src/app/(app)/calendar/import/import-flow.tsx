"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useImport, type Box } from "@/components/import-provider";
import type { CandidateField } from "@/lib/calendar/extraction";
import { saveImported, type EventFormState } from "../actions";

const field = "min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-base";
const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]] as const;
const weekdayOfDate = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

export function ImportFlow() {
  const imp = useImport();
  const { stage, error, boxes, rows, info, until, scanning, base, setRows } = imp;
  const view = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const [saveState, save, saving] = useActionState<EventFormState, FormData>(saveImported, {});

  const showCanvas = stage === "blur" || stage === "consent" || stage === "sending";

  useEffect(() => {
    const c = view.current;
    const b = base.current;
    if (!showCanvas || !c || !b) return;
    if (c.width !== b.width || c.height !== b.height) {
      c.width = b.width;
      c.height = b.height;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(b, 0, 0);
    ctx.fillStyle = "#000";
    for (const r of draft ? [...boxes, draft] : boxes) ctx.fillRect(r.x, r.y, r.w, r.h);
  });

  // After a successful save, drop the finished review so a later visit starts fresh.
  useEffect(() => {
    if (saveState.ok) imp.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState.ok]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = view.current as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function norm(a: { x: number; y: number }, b: { x: number; y: number }): Box {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }

  const update = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const unflag = (flags: CandidateField[], f: CandidateField) => flags.filter((x) => x !== f);

  if (saveState.ok) {
    return (
      <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <p role="status" className="text-green-600">{saveState.message}</p>
        <Link href="/calendar" className="flex min-h-11 items-center justify-center rounded-lg bg-accent text-sm font-medium text-paper">Open calendar</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p role="alert" className="rounded-lg border border-red-400/50 p-3 text-sm">{error}</p> : null}

      {stage === "pick" ? (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">Take a photo of a class timetable, roster or calendar page, or choose one from your gallery. You will cover anything private before it is sent.</p>
          <input type="file" accept="image/*" aria-label="Choose a schedule photo" onChange={(e) => void imp.loadFile(e.target.files?.[0])} className="block min-h-11 w-full text-sm" />
        </div>
      ) : null}

      {showCanvas ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Drag over anything private (names, ID numbers, phone numbers) to cover it with a black box. Covered areas are removed from the photo before it leaves your phone.</p>
          <canvas
            ref={view}
            className="w-full touch-none rounded-lg border border-line"
            onPointerDown={(e) => {
              if (stage !== "blur") return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = point(e);
            }}
            onPointerMove={(e) => {
              if (drag.current) setDraft(norm(drag.current, point(e)));
            }}
            onPointerUp={(e) => {
              if (drag.current) {
                const box = norm(drag.current, point(e));
                if (box.w > 6 && box.h > 6) imp.addBox(box);
              }
              drag.current = null;
              setDraft(null);
            }}
          />
          <div className="grid grid-cols-3 gap-2">
            <button disabled={boxes.length === 0 || stage !== "blur"} onClick={imp.undoBox} className="min-h-11 rounded-lg border border-line text-sm disabled:opacity-40">Undo</button>
            <button disabled={boxes.length === 0 || stage !== "blur"} onClick={imp.clearBoxes} className="min-h-11 rounded-lg border border-line text-sm disabled:opacity-40">Clear</button>
            <button disabled={stage === "sending"} onClick={imp.reset} className="min-h-11 rounded-lg border border-line text-sm disabled:opacity-40">New photo</button>
          </div>
          {stage === "blur" ? <button onClick={imp.toConsent} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper">Continue</button> : null}
          {stage === "sending" ? (
            <p role="status" className="rounded-lg border border-line bg-surface p-3 text-sm text-muted">
              Reading your schedule. This can take up to a minute. You can leave this page and keep using the app; it will keep going and tell you when it is ready.
            </p>
          ) : null}
        </div>
      ) : null}

      {stage === "consent" ? (
        <div role="dialog" aria-label="Send photo to Google Gemini" className="space-y-3 rounded-xl border-2 border-accent/60 bg-surface p-4">
          <p className="font-medium">Send this photo to Google Gemini?</p>
          <p className="text-sm text-muted">Google Gemini will process this photo to read the schedule. LIFEOS does not store the photo. Names inside the picture cannot be detected automatically, so cover them first. On Google&apos;s free tier, submitted content may be used to improve Google products.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={imp.backToBlur} className="min-h-11 rounded-lg border border-line text-sm">Cancel</button>
            <button onClick={() => void imp.send()} className="min-h-11 rounded-lg bg-accent text-sm font-medium text-paper">Send</button>
          </div>
        </div>
      ) : null}

      {stage === "review" ? (
        <form action={save} className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-3 text-sm">
            <p className="font-medium">Review before saving</p>
            <p className="mt-1 text-muted">AI read these from your photo. Nothing is saved until you check it and tap Save. Items with highlighted fields were hard to read, so they start unselected. Your edits are kept if you leave this page.</p>
            {info ? <p className="mt-1 text-muted">{info}</p> : null}
            <p className="mt-1 font-medium">{rows.length} event{rows.length === 1 ? "" : "s"} found, {rows.filter((r) => r.include).length} selected</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: true })))} className="min-h-11 rounded-lg border border-line text-sm">Select all</button>
              <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: false })))} className="min-h-11 rounded-lg border border-line text-sm">Select none</button>
            </div>
            <button type="button" disabled={scanning} onClick={() => void imp.scanAgain()} className="mt-2 min-h-11 w-full rounded-lg border border-line text-sm disabled:opacity-60">
              {scanning ? "Scanning again..." : "Missed some? Scan again"}
            </button>
            <button type="button" onClick={imp.reset} className="mt-2 min-h-11 w-full rounded-lg border border-line text-sm text-muted">Discard and start over</button>
          </div>
          {rows.map((r) => {
            const bad = (f: CandidateField) => r.flags.includes(f);
            const ring = (f: CandidateField) => (bad(f) ? "border-amber-500 bg-amber-500/10" : "border-line");
            return (
              <fieldset key={r.id} className={`space-y-2 rounded-xl border-2 border-dashed p-3 ${r.flags.length ? "border-amber-500/60" : "border-accent/50"} bg-surface`}>
                <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={r.include} onChange={(e) => update(r.id, { include: e.target.checked })} /> Add to calendar
                </label>
                <label className="block text-sm">Title {bad("title") ? <span className="text-amber-600">(check this)</span> : null}
                  <input value={r.title} maxLength={200} onChange={(e) => update(r.id, { title: e.target.value, flags: unflag(r.flags, "title") })} className={`${field} mt-1 ${ring("title")}`} />
                </label>
                {r.days.length > 0 || r.date === "" ? (
                  <div>
                    <p className="text-sm">Repeats weekly on {bad("schedule") ? <span className="text-amber-600">(check this)</span> : null}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {DAYS.map(([n, label]) => (
                        <label key={n} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${ring("schedule")}`}>
                          <input type="checkbox" checked={r.days.includes(n)} onChange={(e) => update(r.id, { days: e.target.checked ? [...r.days, n].sort() : r.days.filter((d) => d !== n), flags: unflag(r.flags, "schedule") })} /> {label}
                        </label>
                      ))}
                    </div>
                    {r.days.length === 0 ? (
                      <label className="mt-2 block text-sm">or one-off date
                        <input type="date" value={r.date} onChange={(e) => update(r.id, { date: e.target.value, flags: unflag(r.flags, "schedule") })} className={`${field} mt-1 ${ring("schedule")}`} />
                      </label>
                    ) : null}
                  </div>
                ) : (
                  <label className="block text-sm">Date {bad("schedule") ? <span className="text-amber-600">(check this)</span> : null}
                    <input type="date" value={r.date} onChange={(e) => update(r.id, { date: e.target.value, flags: unflag(r.flags, "schedule") })} className={`${field} mt-1 ${ring("schedule")}`} />
                  </label>
                )}
                {r.days.length === 0 && r.date ? (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" checked={r.repeat} onChange={(e) => update(r.id, { repeat: e.target.checked })} /> Repeat every week
                  </label>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">Start {bad("startTime") ? <span className="text-amber-600">(check)</span> : null}
                    <input type="time" value={r.startTime} onChange={(e) => update(r.id, { startTime: e.target.value, flags: unflag(r.flags, "startTime") })} className={`${field} mt-1 ${ring("startTime")}`} />
                  </label>
                  <label className="block text-sm">End {bad("endTime") ? <span className="text-amber-600">(check)</span> : null}
                    <input type="time" value={r.endTime} onChange={(e) => update(r.id, { endTime: e.target.value, flags: unflag(r.flags, "endTime") })} className={`${field} mt-1 ${ring("endTime")}`} />
                  </label>
                </div>
              </fieldset>
            );
          })}
          <label className="block text-sm">Repeat weekly classes until (optional)
            <input type="date" value={until} onChange={(e) => imp.setUntil(e.target.value)} className={`${field} mt-1`} />
          </label>
          <input
            type="hidden"
            name="payload"
            value={JSON.stringify({
              until: until || undefined,
              items: rows.filter((r) => r.include).map((r) => ({ title: r.title, days: r.repeat && r.date ? [weekdayOfDate(r.date)] : r.days, date: r.date, startTime: r.startTime, endTime: r.endTime })),
            })}
          />
          {saveState.error ? <p role="alert" className="text-sm text-red-500">{saveState.error}</p> : null}
          <button disabled={saving || !rows.some((r) => r.include)} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper disabled:opacity-50">
            {saving ? "Saving..." : `Save ${rows.filter((r) => r.include).length} selected`}
          </button>
        </form>
      ) : null}
    </div>
  );
}
