import { prisma } from "@/lib/db";

/** Best-effort DDL when migrate deploy lags (Vercel/Neon). */
export async function ensureSaleClosedEarlyColumn() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sale_closed_early" BOOLEAN NOT NULL DEFAULT false`,
    );
  } catch (err) {
    console.error("[ensureSaleClosedEarlyColumn]", err);
  }
}
