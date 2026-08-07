import { prisma } from "@/lib/db";

/** Best-effort DDL when migrate deploy lags (Vercel/Neon). */
export async function ensureScheduleChangedAtColumn() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "schedule_changed_at" TIMESTAMP(3)`,
    );
  } catch (err) {
    console.error("[ensureScheduleChangedAtColumn]", err);
  }
}
