"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Candidate } from "@/lib/calendar/extraction";
import { mergeCandidates, parseStoredImport, serializeImport, toRows, type Row } from "@/lib/calendar/import-state";

export type ImportStage = "pick" | "blur" | "consent" | "sending" | "review";
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const STORAGE_KEY = "lifeos.import.v1";
const MAX_EDGE = 1600;

interface ImportApi {
  stage: ImportStage;
  error: string | null;
  boxes: Box[];
  rows: Row[];
  info: string | null;
  until: string;
  scanning: boolean;
  base: React.RefObject<HTMLCanvasElement | null>;
  loadFile(file: File | undefined): Promise<void>;
  addBox(b: Box): void;
  undoBox(): void;
  clearBoxes(): void;
  toConsent(): void;
  backToBlur(): void;
  send(): Promise<void>;
  scanAgain(): Promise<void>;
  setRows: React.Dispatch<React.SetStateAction<Row[]>>;
  setUntil(v: string): void;
  reset(): void;
}

const Ctx = createContext<ImportApi | null>(null);

export function useImport(): ImportApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useImport must be used inside ImportProvider");
  return v;
}

function blobOf(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process the image."))), "image/jpeg", quality));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

// Re-encoding through a canvas drops EXIF and GPS data. The server strips metadata again as a second layer.
async function encode(source: HTMLCanvasElement): Promise<string> {
  let canvas = source;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const q of [0.8, 0.65, 0.5]) {
      const blob = await blobOf(canvas, q);
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

async function scanImage(image: string): Promise<{ candidates: Candidate[]; dropped: number }> {
  const res = await fetch("/api/schedule/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, consent: true }),
  });
  const data = (await res.json().catch(() => null)) as { error?: string; candidates?: Candidate[]; dropped?: number } | null;
  if (!res.ok || !data?.candidates) throw new Error(data?.error ?? "Could not read the schedule.");
  return { candidates: data.candidates, dropped: data.dropped ?? 0 };
}

// Lives in the app layout, so a running scan and the review list survive moving between pages.
export function ImportProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<ImportStage>("pick");
  const [error, setError] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [until, setUntil] = useState("");
  const [scanning, setScanning] = useState(false);
  const base = useRef<HTMLCanvasElement | null>(null);
  const lastImage = useRef<string | null>(null);

  useEffect(() => {
    try {
      const restored = parseStoredImport(window.sessionStorage.getItem(STORAGE_KEY));
      if (restored) {
        // One-time restore after hydration; reading storage during render would not match the server HTML.
        /* eslint-disable react-hooks/set-state-in-effect */
        setRows(restored.rows);
        setUntil(restored.until);
        setInfo(restored.info);
        setStage("review");
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    try {
      if (stage === "review" && rows.length > 0) window.sessionStorage.setItem(STORAGE_KEY, serializeImport({ rows, until, info }));
      else if (stage === "pick") window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [stage, rows, until, info]);

  const reset = useCallback(() => {
    base.current = null;
    lastImage.current = null;
    setBoxes([]);
    setRows([]);
    setInfo(null);
    setUntil("");
    setError(null);
    setScanning(false);
    setStage("pick");
  }, []);

  const loadFile = useCallback(async (file: File | undefined) => {
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
  }, []);

  const send = useCallback(async () => {
    const b = base.current;
    if (!b) return;
    setError(null);
    setStage("sending");
    try {
      // Composite the photo with the cover boxes burned in, so covered areas never leave the device.
      const out = document.createElement("canvas");
      out.width = b.width;
      out.height = b.height;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Could not process the image.");
      ctx.drawImage(b, 0, 0);
      ctx.fillStyle = "#000";
      for (const r of boxes) ctx.fillRect(r.x, r.y, r.w, r.h);
      const image = await encode(out);
      lastImage.current = image;
      const { candidates, dropped } = await scanImage(image);
      if (candidates.length === 0) throw new Error("No events were found in that photo. Try a clearer, closer picture.");
      setRows(toRows(candidates));
      setInfo(dropped ? `${dropped} unreadable item(s) were skipped.` : null);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStage("blur");
    }
  }, [boxes]);

  const scanAgain = useCallback(async () => {
    if (!lastImage.current || scanning) return;
    setError(null);
    setScanning(true);
    try {
      const { candidates } = await scanImage(lastImage.current);
      setRows((current) => {
        const merged = mergeCandidates(current, candidates);
        setInfo(merged.added ? `Scanned again and found ${merged.added} more event${merged.added === 1 ? "" : "s"}.` : "Scanned again and found nothing new.");
        return merged.rows;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setScanning(false);
    }
  }, [scanning]);

  const api = useMemo<ImportApi>(
    () => ({
      stage, error, boxes, rows, info, until, scanning, base, loadFile,
      addBox: (b) => setBoxes((x) => [...x, b]),
      undoBox: () => setBoxes((x) => x.slice(0, -1)),
      clearBoxes: () => setBoxes([]),
      toConsent: () => setStage("consent"),
      backToBlur: () => setStage("blur"),
      send, scanAgain, setRows, setUntil, reset,
    }),
    [stage, error, boxes, rows, info, until, scanning, loadFile, send, scanAgain, reset],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// Shown on every page except the import page while a scan runs or results are waiting.
export function ImportBanner() {
  const { stage, scanning, error } = useImport();
  const path = usePathname();
  if (path === "/calendar/import") return null;
  const busy = stage === "sending" || scanning;
  if (!busy && stage !== "review" && !(error && stage === "blur")) return null;
  return (
    <Link
      href="/calendar/import"
      role="status"
      className="mb-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-accent/50 bg-accent/10 px-4 text-sm"
    >
      <span>
        {busy ? "Reading your schedule photo. You can keep using the app." : error && stage === "blur" ? "Schedule import failed. Tap to try again." : "Your schedule is ready to review."}
      </span>
      <span className="text-accent">Open</span>
    </Link>
  );
}
