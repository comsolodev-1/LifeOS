import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { AppError } from "@/lib/errors";
import * as schema from "./schema";

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function createDb(url: string) {
  return drizzle(neon(url), { schema });
}

export type Db = ReturnType<typeof createDb>;

let testDb: Db | null = null;

// Test seam only: lets integration tests run the real data-access layer against an in-memory Postgres.
export function __setDbForTests(db: unknown) {
  testDb = db as Db | null;
}

export function getDb(): Db {
  if (testDb) return testDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return createDb(url);
}

// Neon free compute suspends when idle; the first request can fail while it wakes up.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AppError) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** i));
    }
  }
  throw lastError;
}
