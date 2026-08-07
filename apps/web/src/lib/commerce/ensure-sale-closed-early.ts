import { prisma } from "@/lib/db";
import { shouldSkipRuntimeDdl } from "@/lib/db/runtime-ddl";

/** Best-effort DDL when migrate deploy lags (local/dev only). */
export async function ensureSaleClosedEarlyColumn() {
  if (shouldSkipRuntimeDdl()) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sale_closed_early" BOOLEAN NOT NULL DEFAULT false`,
    );
  } catch (err) {
    console.error("[ensureSaleClosedEarlyColumn]", err);
  }
}
