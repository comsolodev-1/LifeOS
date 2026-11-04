import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { compact } from "./normalize";

export function parseKey(b64: string | undefined): Buffer {
  if (!b64) throw new Error("VAULT_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("VAULT_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function isVaultKeyValid(b64: string | undefined): boolean {
  try {
    parseKey(b64);
    return true;
  } catch {
    return false;
  }
}

// Format: v1:<iv>:<tag>:<ciphertext>, all base64. AES-256-GCM with a random 12-byte IV per value.
export function encrypt(plain: string, key: Buffer = parseKey(process.env.VAULT_KEY)): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function decrypt(payload: string, key: Buffer = parseKey(process.env.VAULT_KEY)): string {
  const [version, iv, tag, body] = payload.split(":");
  if (version !== "v1" || !iv || !tag || body === undefined) throw new Error("Unsupported ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

// Deterministic fingerprint for de-duplication without storing plaintext.
export function fingerprint(value: string, key: Buffer = parseKey(process.env.VAULT_KEY)): string {
  return createHmac("sha256", key).update("vault-dedupe:" + compact(value)).digest("hex");
}
