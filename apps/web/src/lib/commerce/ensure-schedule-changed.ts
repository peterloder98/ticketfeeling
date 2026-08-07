import { prisma } from "@/lib/db";
import { shouldSkipRuntimeDdl } from "@/lib/db/runtime-ddl";

/** Best-effort DDL when migrate deploy lags (local/dev only). */
export async function ensureScheduleChangedAtColumn() {
  if (shouldSkipRuntimeDdl()) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "schedule_changed_at" TIMESTAMP(3)`,
    );
  } catch (err) {
    console.error("[ensureScheduleChangedAtColumn]", err);
  }
}
