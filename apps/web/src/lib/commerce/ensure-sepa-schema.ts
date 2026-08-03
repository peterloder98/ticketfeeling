import type { PrismaClient } from "@prisma/client";

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

let ensurePromise: Promise<void> | null = null;

/** Best-effort column patch when migrate deploy has not run yet. Memoized on success only. */
export async function ensureSepaPaymentSchema(db: PrismaClient) {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    let failed = false;
    await Promise.all(
      SEPA_SCHEMA_STATEMENTS.map(async (sql) => {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (error) {
          failed = true;
          console.error("[sepa] ensureSepaPaymentSchema failed", sql.slice(0, 80), error);
        }
      }),
    );
    if (failed) {
      // Clear so the next request can recover after transient Neon/pooler DDL failures.
      ensurePromise = null;
    }
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });
  return ensurePromise;
}
