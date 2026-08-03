import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

/**
 * Best-effort DDL when migrate deploy lags behind (common on Vercel/Neon).
 * Safe to call on every cart/checkout path that touches EventSeat.
 * Memoized once per process — subsequent calls are free.
 */
const SEATING_SCHEMA_STATEMENTS = [
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seating_layout_config" JSONB NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "category_id" UUID`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS "event_seats_event_id_category_id_status_idx" ON "event_seats"("event_id", "category_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "event_seats_event_id_locked_status_idx" ON "event_seats"("event_id", "locked", "status")`,
];

const SEATING_FK_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_seats_category_id_fkey'
  ) THEN
    ALTER TABLE "event_seats"
      ADD CONSTRAINT "event_seats_category_id_fkey"
      FOREIGN KEY ("category_id")
      REFERENCES "event_ticket_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureSeatingAssignmentSchema(db: PrismaClient = defaultPrisma) {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    // IF NOT EXISTS statements are independent — run in parallel on cold start.
    await Promise.all(
      SEATING_SCHEMA_STATEMENTS.map(async (sql) => {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (error) {
          console.error("[seating] ensureSeatingAssignmentSchema failed", sql.slice(0, 80), error);
        }
      }),
    );
    try {
      await db.$executeRawUnsafe(SEATING_FK_SQL);
    } catch (error) {
      console.error("[seating] ensureSeatingAssignmentSchema FK failed", error);
    }
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });
  return ensurePromise;
}
