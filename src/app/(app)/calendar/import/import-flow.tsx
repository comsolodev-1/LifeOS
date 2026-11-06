"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { Candidate, CandidateField } from "@/lib/calendar/extraction";
import { saveImported, type EventFormState } from "../actions";

const field = "min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-base";
const MAX_EDGE = 1600;
const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]] as const;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Row = Candidate & { include: boolean };
type Stage = "pick" | "blur" | "consent" | "sending" | "review";

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process the image."))), "image/jpeg", quality));
}

// Re-encoding through a canvas drops EXIF and GPS data. The server strips metadata again as a second layer.
async function encodeForUpload(source: HTMLCanvasElement): Promise<string> {
  let canvas = source;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const q of [0.8, 0.65, 0.5]) {
      const blob = await canvasBlob(canvas, q);
      if (blob.size <= 1_800_000) return toBase64(blob);
    }
    const smaller = document.createElement("canvas");
    smaller.width = Math.round(canvas.width * 0.7);
    smaller.height = Math.round(canvas.height * 0.7);
    smaller.getContext("2d")?.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    canvas = smaller;
  }
  throw new Error("That image is too large. Try a smaller photo.");
}

export function ImportFlow() {
  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [until, setUntil] = useState("");
  const base = useRef<HTMLCanvasElement | null>(null);
  const view = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const [saveState, save, saving] = useActionState<EventFormState, FormData>(saveImported, {});

  function redraw(list: Box[], extra: Box | null) {
    const c = view.current;
    const b = base.current;
    if (!c || !b) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(b, 0, 0);
    ctx.fillStyle = "#000";
    for (const r of extra ? [...list, extra] : list) ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  useEffect(() => {
    if (stage === "blur") redraw(boxes, draft);
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      base.current = c;
      setBoxes([]);
      setStage("blur");
    } catch {
      setError("Could not read this image. Use a JPEG, PNG or WebP photo.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = view.current as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function norm(a: { x: number; y: number }, b: { x: number; y: number }): Box {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }

  async function send() {
    setError(null);
    setStage("sending");
    try {
      redraw(boxes, null);
      const image = await encodeForUpload(view.current as HTMLCanvasElement);
      const res = await fetch("/api/schedule/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, consent: true }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; candidates?: Candidate[]; dropped?: number } | null;
      if (!res.ok || !data?.candidates) throw new Error(data?.error ?? "Could not read the schedule.");
      if (data.candidates.length === 0) throw new Error("No events were found in that photo. Try a clearer, closer picture.");
      setRows(data.candidates.map((c) => ({ ...c, include: c.flags.length === 0 })));
      setInfo(data.dropped ? `${data.dropped} unreadable item(s) were skipped.` : null);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStage("blur");
    }
  }

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, flags: patch.flags ?? r.flags } : r)));
  const clearFlag = (r: Row, f: CandidateField) => r.flags.filter((x) => x !== f);

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
          <input type="file" accept="image/*" aria-label="Choose a schedule photo" onChange={(e) => void onFile(e.target.files?.[0])} className="block min-h-11 w-full text-sm" />
        </div>
      ) : null}

      {stage === "blur" || stage === "consent" || stage === "sending" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Drag over anything private (names, ID numbers, phone numbers) to cover it with a black box. Covered areas are removed from the photo before it leaves your phone.</p>
          <canvas
            ref={(el) => {
              view.current = el;
              if (el && base.current && (el.width !== base.current.width || el.height !== base.current.height)) {
                el.width = base.current.width;
                el.height = base.current.height;
              }
            }}
            className="w-full touch-none rounded-lg border border-line"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = point(e);
            }}
            onPointerMove={(e) => {
              if (drag.current) setDraft(norm(drag.current, point(e)));
            }}
            onPointerUp={(e) => {
              if (drag.current) {
                const box = norm(drag.current, point(e));
                if (box.w > 6 && box.h > 6) setBoxes((b) => [...b, box]);
              }
              drag.current = null;
              setDraft(null);
            }}
          />
          <div className="grid grid-cols-3 gap-2">
            <button disabled={boxes.length === 0} onClick={() => setBoxes((b) => b.slice(0, -1))} className="min-h-11 rounded-lg border border-line text-sm disabled:opacity-40">Undo</button>
            <button disabled={boxes.length === 0} onClick={() => setBoxes([])} className="min-h-11 rounded-lg border border-line text-sm disabled:opacity-40">Clear</button>
            <button onClick={() => { setStage("pick"); setBoxes([]); }} className="min-h-11 rounded-lg border border-line text-sm">New photo</button>
          </div>
          {stage === "blur" ? (
            <button onClick={() => setStage("consent")} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper">Continue</button>
          ) : null}
          {stage === "sending" ? <p role="status" className="text-sm text-muted">Reading your schedule. This can take up to a minute.</p> : null}
        </div>
      ) : null}

      {stage === "consent" ? (
        <div role="dialog" aria-label="Send photo to Google Gemini" className="space-y-3 rounded-xl border-2 border-accent/60 bg-surface p-4">
          <p className="font-medium">Send this photo to Google Gemini?</p>
          <p className="text-sm text-muted">Google Gemini will process this photo to read the schedule. LIFEOS does not store the photo. Names inside the picture cannot be detected automatically, so cover them first. On Google&apos;s free tier, submitted content may be used to improve Google products.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setStage("blur")} className="min-h-11 rounded-lg border border-line text-sm">Cancel</button>
            <button onClick={() => void send()} className="min-h-11 rounded-lg bg-accent text-sm font-medium text-paper">Send</button>
          </div>
        </div>
      ) : null}

      {stage === "review" ? (
        <form action={save} className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-3 text-sm">
            <p className="font-medium">Review before saving</p>
            <p className="mt-1 text-muted">AI read these from your photo. Nothing is saved until you check it and tap Save. Items with highlighted fields were hard to read, so they start unselected.</p>
            {info ? <p className="mt-1 text-muted">{info}</p> : null}
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
                  <input value={r.title} maxLength={200} onChange={(e) => update(r.id, { title: e.target.value, flags: clearFlag(r, "title") })} className={`${field} mt-1 ${ring("title")}`} />
                </label>
                {r.days.length > 0 || r.date === "" ? (
                  <div>
                    <p className="text-sm">Repeats weekly on {bad("schedule") ? <span className="text-amber-600">(check this)</span> : null}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {DAYS.map(([n, label]) => (
                        <label key={n} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${ring("schedule")}`}>
                          <input type="checkbox" checked={r.days.includes(n)} onChange={(e) => update(r.id, { days: e.target.checked ? [...r.days, n].sort() : r.days.filter((d) => d !== n), flags: clearFlag(r, "schedule") })} /> {label}
                        </label>
                      ))}
                    </div>
                    {r.days.length === 0 ? (
                      <label className="mt-2 block text-sm">or one-off date
                        <input type="date" value={r.date} onChange={(e) => update(r.id, { date: e.target.value, flags: clearFlag(r, "schedule") })} className={`${field} mt-1 ${ring("schedule")}`} />
                      </label>
                    ) : null}
                  </div>
                ) : (
                  <label className="block text-sm">Date {bad("schedule") ? <span className="text-amber-600">(check this)</span> : null}
                    <input type="date" value={r.date} onChange={(e) => update(r.id, { date: e.target.value, flags: clearFlag(r, "schedule") })} className={`${field} mt-1 ${ring("schedule")}`} />
                  </label>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">Start {bad("startTime") ? <span className="text-amber-600">(check)</span> : null}
                    <input type="time" value={r.startTime} onChange={(e) => update(r.id, { startTime: e.target.value, flags: clearFlag(r, "startTime") })} className={`${field} mt-1 ${ring("startTime")}`} />
                  </label>
                  <label className="block text-sm">End {bad("endTime") ? <span className="text-amber-600">(check)</span> : null}
                    <input type="time" value={r.endTime} onChange={(e) => update(r.id, { endTime: e.target.value, flags: clearFlag(r, "endTime") })} className={`${field} mt-1 ${ring("endTime")}`} />
                  </label>
                </div>
              </fieldset>
            );
          })}
          <label className="block text-sm">Repeat weekly classes until (optional)
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${field} mt-1`} />
          </label>
          <input
            type="hidden"
            name="payload"
            value={JSON.stringify({ until: until || undefined, items: rows.filter((r) => r.include).map(({ title, days, date, startTime, endTime }) => ({ title, days, date, startTime, endTime })) })}
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
