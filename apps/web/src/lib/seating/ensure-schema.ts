import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { withTimeoutFallback } from "@/lib/async-timeout";
import { shouldSkipRuntimeDdl } from "@/lib/db/runtime-ddl";

/**
 * Best-effort DDL when migrate deploy lags behind (common on Vercel/Neon).
 * Safe to call on every cart/checkout path that touches EventSeat.
 * Sequential only — parallel ALTER on event_seats hung cart/checkout in production.
 * Memoized on success; budget-capped so hot paths never wait minutes.
 */
const SEATING_SCHEMA_STATEMENTS = [
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seating_layout_config" JSONB NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_prefer_contiguous" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_prevent_new_singletons" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_intelligent_remnants" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_gap_relax_occupancy_percent" INTEGER NOT NULL DEFAULT 90`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "category_id" UUID`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "segment_index" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "position_in_segment" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "seat_type" TEXT NOT NULL DEFAULT 'standard'`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "companion_of_seat_key" TEXT`,
  `ALTER TABLE "venue_plans" ADD COLUMN IF NOT EXISTS "category_slots" JSONB NOT NULL DEFAULT '[]'`,
  `CREATE INDEX IF NOT EXISTS "event_seats_event_id_category_id_status_idx" ON "event_seats"("event_id", "category_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "event_seats_event_id_locked_status_idx" ON "event_seats"("event_id", "locked", "status")`,
  `CREATE INDEX IF NOT EXISTS "event_seats_event_id_segment_idx" ON "event_seats"("event_id", "block_object_id", "row_index", "segment_index")`,
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
/** Avoid information_schema probes on every cart/checkout click after a miss/skip. */
const PROBE_NEGATIVE_TTL_MS = 5 * 60 * 1000;

let ensurePromise: Promise<void> | null = null;
let schemaReady = false;
let lastIncompleteProbeAt = 0;

async function probeSeatingSchemaReady(db: PrismaClient): Promise<boolean> {
  try {
    const present = new Set(
      (
        await db.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
          `SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = 'public'
             AND (
               (table_name = 'event_seats' AND column_name = 'category_id')
               OR (table_name = 'event_seats' AND column_name = 'segment_index')
               OR (table_name = 'venue_plans' AND column_name = 'category_slots')
               OR (table_name = 'events' AND column_name = 'seating_layout_config')
               OR (table_name = 'events' AND column_name = 'seat_opt_prefer_contiguous')
             )`,
        )
      ).map((r) => `${r.table_name}.${r.column_name}`),
    );
    return (
      present.has("event_seats.category_id") &&
      present.has("venue_plans.category_slots") &&
      present.has("events.seating_layout_config") &&
      present.has("event_seats.segment_index") &&
      present.has("events.seat_opt_prefer_contiguous")
    );
  } catch {
    return false;
  }
}

export async function ensureSeatingAssignmentSchema(db: PrismaClient = defaultPrisma) {
  if (schemaReady) return;
  // Negative cache: incomplete/skipped schema must not re-probe every request.
  if (
    !ensurePromise &&
    lastIncompleteProbeAt > 0 &&
    Date.now() - lastIncompleteProbeAt < PROBE_NEGATIVE_TTL_MS
  ) {
    return;
  }
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (await probeSeatingSchemaReady(db)) {
        schemaReady = true;
        lastIncompleteProbeAt = 0;
        return;
      }

      if (shouldSkipRuntimeDdl()) {
        console.error(
          "[seating] ensureSeatingAssignmentSchema: schema incomplete in production — run migrate-deploy (skipping runtime ALTER)",
        );
        lastIncompleteProbeAt = Date.now();
        ensurePromise = null;
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
        lastIncompleteProbeAt = Date.now();
        ensurePromise = null;
        return;
      }
      schemaReady = true;
      lastIncompleteProbeAt = 0;
    })().catch((error) => {
      lastIncompleteProbeAt = Date.now();
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
