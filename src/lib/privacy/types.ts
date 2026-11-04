export type PrivacyMode = "strict" | "balanced";

export const VAULT_TYPES = ["owner", "person", "email", "phone", "place", "org", "handle", "other"] as const;
export type VaultType = (typeof VAULT_TYPES)[number];

export interface VaultEntry {
  id: string;
  type: VaultType;
  value: string;
  aliases: string[];
}

export const TOKEN_PREFIX: Record<VaultType, string> = {
  owner: "OWNER",
  person: "PERSON",
  email: "EMAIL",
  phone: "PHONE",
  place: "PLACE",
  org: "ORG",
  handle: "HANDLE",
  other: "OTHER",
};
