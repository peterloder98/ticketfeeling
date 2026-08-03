import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/** Best-effort DDL when migrate deploy lags behind. */
export async function ensureSeatingAssignmentSchema(db: PrismaClient = defaultPrisma) {
  const statements = [
    `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seating_layout_config" JSONB NOT NULL DEFAULT '{}'`,
    `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "category_id" UUID`,
    `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false`,
  ];
  for (const sql of statements) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch (error) {
      console.error("[seating] ensureSeatingAssignmentSchema failed", sql, error);
    }
  }
}
