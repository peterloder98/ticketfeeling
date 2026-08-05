import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { withTimeoutFallback } from "@/lib/async-timeout";

/**
 * Best-effort DDL when migrate deploy lags behind (common on Vercel/Neon).
 * Safe to call on every cart/checkout path that touches EventSeat.
 * Sequential only — parallel ALTER on event_seats hung cart/checkout in production.
 * Memoized on success; budget-capped so hot paths never wait minutes.
 */
const SEATING_SCHEMA_STATEMENTS = [
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seating_layout_config" JSONB NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "category_id" UUID`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "venue_plans" ADD COLUMN IF NOT EXISTS "category_slots" JSONB NOT NULL DEFAULT '[]'`,
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

const ENSURE_BUDGET_MS = 4_000;

let ensurePromise: Promise<void> | null = null;
let schemaReady = false;

async function probeSeatingSchemaReady(db: PrismaClient): Promise<boolean> {
  try {
    const present = new Set(
      (
        await db.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
          `SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = 'public'
             AND (
               (table_name = 'event_seats' AND column_name = 'category_id')
               OR (table_name = 'venue_plans' AND column_name = 'category_slots')
               OR (table_name = 'events' AND column_name = 'seating_layout_config')
             )`,
        )
      ).map((r) => `${r.table_name}.${r.column_name}`),
    );
    return (
      present.has("event_seats.category_id") &&
      present.has("venue_plans.category_slots") &&
      present.has("events.seating_layout_config")
    );
  } catch {
    return false;
  }
}

export async function ensureSeatingAssignmentSchema(db: PrismaClient = defaultPrisma) {
  if (schemaReady) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (await probeSeatingSchemaReady(db)) {
        schemaReady = true;
        return;
      }

      let failed = false;
      for (const sql of SEATING_SCHEMA_STATEMENTS) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (error) {
          failed = true;
          console.error("[seating] ensureSeatingAssignmentSchema failed", sql.slice(0, 80), error);
        }
      }
      try {
        await db.$executeRawUnsafe(SEATING_FK_SQL);
      } catch (error) {
        failed = true;
        console.error("[seating] ensureSeatingAssignmentSchema FK failed", error);
      }
      if (failed) {
        ensurePromise = null;
        return;
      }
      schemaReady = true;
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  await withTimeoutFallback(
    ensurePromise,
    ENSURE_BUDGET_MS,
    undefined,
    "ensureSeatingAssignmentSchema",
  );
}
