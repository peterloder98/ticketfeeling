-- OrganizationSettings: SEPA defaults + payment UI config
ALTER TABLE "organization_settings"
  ALTER COLUMN "sepa_min_days_before_event" SET DEFAULT 7;

ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "payment_ui_config" JSONB NOT NULL DEFAULT '{}';

-- Event-level SEPA override
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "sepa_min_days_before_event" INTEGER;

-- Order payment / SEPA fields
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_payment_method_id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_mandate_id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "iban_last4" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "account_holder_name" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reservation_status" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reserved_until" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_processing_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_succeeded_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ticket_released_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ticket_sent_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "failed_reason_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "failed_reason_message" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "webhook_processing_version" INTEGER NOT NULL DEFAULT 1;

-- Inventory holds linked to orders for async payment
ALTER TABLE "inventory_holds" ADD COLUMN IF NOT EXISTS "order_id" UUID;
CREATE INDEX IF NOT EXISTS "inventory_holds_order_id_idx" ON "inventory_holds"("order_id");
