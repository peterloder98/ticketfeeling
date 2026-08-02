-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "payment_fee_config" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ticket_subtotal_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_total_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_provider" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "estimated_payment_fee_cents" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "actual_payment_fee_cents" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "net_payout_cents" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_status" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "provider_transaction_id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "provider_fee_currency" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_created_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_completed_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_failed_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refunded_amount_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refund_fee_cents" INTEGER NOT NULL DEFAULT 0;
