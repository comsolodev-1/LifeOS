import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, fingerprint, isVaultKeyValid, parseKey } from "../src/lib/privacy/crypto";

const key = randomBytes(32);

describe("vault encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const sealed = encrypt("Maria Santos", key);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("Maria");
    expect(decrypt(sealed, key)).toBe("Maria Santos");
  });
  it("uses a fresh IV every time", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });
  it("rejects tampered ciphertext and the wrong key", () => {
    const parts = encrypt("secret value", key).split(":");
    const body = Buffer.from(parts[3], "base64");
    body[0] ^= 1;
    parts[3] = body.toString("base64");
    expect(() => decrypt(parts.join(":"), key)).toThrow();
    expect(() => decrypt(encrypt("x", key), randomBytes(32))).toThrow();
  });
  it("validates VAULT_KEY format", () => {
    expect(isVaultKeyValid(randomBytes(32).toString("base64"))).toBe(true);
    expect(isVaultKeyValid(randomBytes(16).toString("base64"))).toBe(false);
    expect(isVaultKeyValid(undefined)).toBe(false);
    expect(() => parseKey("")).toThrow();
  });
  it("fingerprints ignore case and spacing but differ by value", () => {
    expect(fingerprint("Maria  Santos", key)).toBe(fingerprint("maria santos", key));
    expect(fingerprint("Maria Santos", key)).not.toBe(fingerprint("Maria Santo", key));
  });
});
