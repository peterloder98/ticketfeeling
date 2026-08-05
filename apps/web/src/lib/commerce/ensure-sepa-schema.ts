import type { PrismaClient } from "@prisma/client";
import { withTimeoutFallback } from "@/lib/async-timeout";

const SEPA_SCHEMA_STATEMENTS = [
  `ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "payment_ui_config" JSONB NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sepa_min_days_before_event" INTEGER`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_payment_method_id" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_mandate_id" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "iban_last4" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "account_holder_name" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reservation_status" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reserved_until" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_processing_at" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_succeeded_at" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ticket_released_at" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ticket_sent_at" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "failed_reason_code" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "failed_reason_message" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "webhook_processing_version" INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE "inventory_holds" ADD COLUMN IF NOT EXISTS "order_id" UUID`,
  `CREATE INDEX IF NOT EXISTS "inventory_holds_order_id_idx" ON "inventory_holds"("order_id")`,
];

const ENSURE_BUDGET_MS = 4_000;

let ensurePromise: Promise<void> | null = null;
let schemaReady = false;

async function probeSepaSchemaReady(db: PrismaClient): Promise<boolean> {
  try {
    // Must check BOTH sides — a partial apply (orders ok, events missing) used to
    // short-circuit ensure and leave admin event detail on P2022 / Application error.
    const present = new Set(
      (
        await db.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
          `SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = 'public'
             AND (
               (table_name = 'orders' AND column_name = 'reservation_status')
               OR (table_name = 'events' AND column_name = 'sepa_min_days_before_event')
             )`,
        )
      ).map((r) => `${r.table_name}.${r.column_name}`),
    );
    return (
      present.has("orders.reservation_status") &&
      present.has("events.sepa_min_days_before_event")
    );
  } catch {
    return false;
  }
}

/**
 * Best-effort column patch when migrate deploy has not run yet.
 * Sequential DDL only — parallel ALTER on the same table deadlocks/hangs on Neon.
 * Memoized on success; bounded so checkout never waits minutes on DDL.
 */
export async function ensureSepaPaymentSchema(db: PrismaClient) {
  if (schemaReady) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (await probeSepaSchemaReady(db)) {
        schemaReady = true;
        return;
      }

      let failed = false;
      // CRITICAL: run sequentially. Parallel ALTER TABLE on "orders" caused
      // production checkout hangs (exclusive locks + Neon pooler).
      for (const sql of SEPA_SCHEMA_STATEMENTS) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (error) {
          failed = true;
          console.error("[sepa] ensureSepaPaymentSchema failed", sql.slice(0, 80), error);
        }
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

  // Caller never waits more than the budget — background DDL may still finish.
  await withTimeoutFallback(ensurePromise, ENSURE_BUDGET_MS, undefined, "ensureSepaPaymentSchema");
}
