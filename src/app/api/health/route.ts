import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDbConfigured, withRetry } from "@/db";
import { ENV_VARS } from "@/lib/owner";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = Object.fromEntries(ENV_VARS.map((k) => [k, Boolean(process.env[k])]));
  let db: "ok" | "error" | "not_configured" = "not_configured";
  if (isDbConfigured()) {
    try {
      await withRetry(() => getDb().execute(sql`select 1`), 2);
      db = "ok";
    } catch {
      db = "error";
    }
  }
  const status = db === "error" ? "degraded" : "ok";
  return NextResponse.json({ status, db, config }, { status: db === "error" ? 503 : 200 });
}
