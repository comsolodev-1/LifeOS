import { describe, expect, it } from "vitest";
import { authProvidersConfigured, isOwnerEmail } from "../src/lib/owner";

describe("isOwnerEmail", () => {
  it("accepts the owner regardless of case and spacing", () => {
    expect(isOwnerEmail(" Owner@Example.com ", "owner@example.com")).toBe(true);
  });
  it("rejects other accounts", () => {
    expect(isOwnerEmail("other@example.com", "owner@example.com")).toBe(false);
  });
  it("rejects when email or OWNER_EMAIL is missing", () => {
    expect(isOwnerEmail(undefined, "owner@example.com")).toBe(false);
    expect(isOwnerEmail("owner@example.com", undefined)).toBe(false);
    expect(isOwnerEmail("", "")).toBe(false);
  });
  it("does not match on suffix or prefix", () => {
    expect(isOwnerEmail("xowner@example.com", "owner@example.com")).toBe(false);
    expect(isOwnerEmail("owner@example.com.evil.io", "owner@example.com")).toBe(false);
  });
});

describe("authProvidersConfigured", () => {
  it("requires both id and secret", () => {
    expect(authProvidersConfigured({ AUTH_GOOGLE_ID: "a" })).toEqual({ google: false, github: false });
    expect(authProvidersConfigured({ AUTH_GITHUB_ID: "a", AUTH_GITHUB_SECRET: "b" })).toEqual({ google: false, github: true });
  });
});
