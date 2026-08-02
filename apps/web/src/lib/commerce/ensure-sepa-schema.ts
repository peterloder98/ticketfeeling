import type { PrismaClient } from "@prisma/client";

/** Best-effort column patch when migrate deploy has not run yet. */
export async function ensureSepaPaymentSchema(db: PrismaClient) {
  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "payment_ui_config" JSONB NOT NULL DEFAULT '{}'`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sepa_min_days_before_event" INTEGER`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_payment_method_id" TEXT`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_mandate_id" TEXT`,
    );
    await db.$executeRawUnsafe(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "iban_last4" TEXT`);
    await db.$executeRawUnsafe(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "account_holder_name" TEXT`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reservation_status" TEXT`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reserved_until" TIMESTAMP(3)`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_processing_at" TIMESTAMP(3)`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_succeeded_at" TIMESTAMP(3)`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "inventory_holds" ADD COLUMN IF NOT EXISTS "order_id" UUID`,
    );
  } catch {
    /* ignore on unsupported envs */
  }
}
