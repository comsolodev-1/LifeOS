import type { VaultEntry } from "../src/lib/privacy/types";

export const NOW = new Date("2026-11-04T00:00:00Z");

export const VAULT: VaultEntry[] = [
  { id: "1", type: "owner", value: "Juan Miguel Dela Cruz", aliases: ["Migs", "Juan Dela Cruz"] },
  { id: "2", type: "person", value: "Maria Santos", aliases: ["Ate Mia"] },
  { id: "3", type: "org", value: "Camarines Norte State College", aliases: ["CNSC"] },
  { id: "4", type: "place", value: "Daet", aliases: [] },
  { id: "5", type: "person", value: "José Ñañez", aliases: [] },
];
