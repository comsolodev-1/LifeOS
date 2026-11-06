import { AppError } from "@/lib/errors";

export type ImageType = "jpeg" | "png" | "webp";
export const MIME: Record<ImageType, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const MAX_IMAGE_BYTES = 2_500_000;

// Identifies the real format from the file's first bytes. The claimed MIME type is never trusted.
export function detectImageType(b: Uint8Array): ImageType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

const bad = () => new AppError("That image file looks damaged. Try another photo.");

// JPEG: keep only what is needed to draw the picture. Drops EXIF/GPS (APP1), XMP, ICC, comments and other app segments.
function stripJpeg(b: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw bad();
    while (b[i] === 0xff) i++; // fill bytes
    const marker = b[i++];
    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      return Uint8Array.from(out);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker);
      continue;
    }
    if (i + 2 > b.length) throw bad();
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2 || i + len > b.length) throw bad();
    if (marker === 0xda) {
      // Start of scan: the rest of the file is compressed image data.
      out.push(0xff, marker);
      for (let k = i; k < b.length; k++) out.push(b[k]);
      return Uint8Array.from(out);
    }
    const dropped = (marker >= 0xe1 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
    if (!dropped) {
      out.push(0xff, marker);
      for (let k = i; k < i + len; k++) out.push(b[k]);
    }
    i += len;
  }
  throw bad();
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS"]);

function stripPng(b: Uint8Array): Uint8Array {
  const out: number[] = Array.from(b.slice(0, 8));
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const end = i + 12 + len;
    if (end > b.length) throw bad();
    if (PNG_KEEP.has(type)) for (let k = i; k < end; k++) out.push(b[k]);
    i = end;
    if (type === "IEND") return Uint8Array.from(out);
  }
  throw bad();
}

function stripWebp(b: Uint8Array): Uint8Array {
  const chunks: number[][] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24);
    const padded = len + (len % 2);
    const end = i + 8 + padded;
    if (len < 0 || end > b.length + 1) throw bad();
    if (type !== "EXIF" && type !== "XMP " && type !== "ICCP") {
      const chunk = Array.from(b.slice(i, Math.min(end, b.length)));
      while (chunk.length < 8 + padded) chunk.push(0);
      if (type === "VP8X") chunk[8] &= ~(0x08 | 0x04 | 0x20); // clear the EXIF, XMP and ICC flags
      chunks.push(chunk);
    }
    i = end;
  }
  const bodyLen = 4 + chunks.reduce((n, c) => n + c.length, 0);
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, bodyLen & 255, (bodyLen >> 8) & 255, (bodyLen >> 16) & 255, (bodyLen >>> 24) & 255,
    0x57, 0x45, 0x42, 0x50, ...chunks.flat(),
  ]);
}

export function stripMetadata(bytes: Uint8Array, type: ImageType): Uint8Array {
  return type === "jpeg" ? stripJpeg(bytes) : type === "png" ? stripPng(bytes) : stripWebp(bytes);
}

export function decodeUpload(base64: string): { bytes: Uint8Array; type: ImageType } {
  if (base64.length > MAX_IMAGE_BYTES * 1.4) throw new AppError("That image is too large. Try a smaller photo.");
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  if (bytes.length === 0) throw new AppError("No image received.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new AppError("That image is too large. Try a smaller photo.");
  const type = detectImageType(bytes);
  if (!type) throw new AppError("Only JPEG, PNG or WebP images are supported.");
  return { bytes: stripMetadata(bytes, type), type };
}
