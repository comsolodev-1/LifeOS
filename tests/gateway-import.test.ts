import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("Gemini SDK isolation", () => {
  it("is imported only inside src/lib/privacy/gateway.ts", () => {
    const allowed = path.join("src", "lib", "privacy", "gateway.ts");
    const offenders = walk("src")
      .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f) && f !== allowed)
      .filter((f) => /@google\/genai|google-genai/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("is actually used by the gateway", () => {
    expect(readFileSync(path.join("src", "lib", "privacy", "gateway.ts"), "utf8")).toContain("@google/genai");
  });
});
