-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "discount_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discount_code" TEXT,
ADD COLUMN     "gift_card_applied_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gift_card_code" TEXT;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "tracking_ga4_measurement_id" TEXT,
ADD COLUMN     "tracking_google_ads_id" TEXT,
ADD COLUMN     "tracking_gtm_container_id" TEXT,
ADD COLUMN     "tracking_meta_pixel_id" TEXT,
ADD COLUMN     "tracking_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "tracking_use_org_defaults" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discount_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discount_code" TEXT,
ADD COLUMN     "gift_card_applied_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gift_card_code" TEXT;

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "smtp_from_email" TEXT,
ADD COLUMN     "smtp_from_name" TEXT,
ADD COLUMN     "smtp_host" TEXT,
ADD COLUMN     "smtp_password_enc" TEXT,
ADD COLUMN     "smtp_port" INTEGER NOT NULL DEFAULT 465,
ADD COLUMN     "smtp_secure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "smtp_user" TEXT,
ADD COLUMN     "tracking_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tracking_ga4_measurement_id" TEXT,
ADD COLUMN     "tracking_google_ads_id" TEXT,
ADD COLUMN     "tracking_gtm_container_id" TEXT,
ADD COLUMN     "tracking_meta_capi_token_enc" TEXT,
ADD COLUMN     "tracking_meta_pixel_id" TEXT,
ADD COLUMN     "tse_client_id" TEXT,
ADD COLUMN     "tse_config_enc" TEXT,
ADD COLUMN     "tse_mode" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "tse_provider" TEXT,
ADD COLUMN     "tse_tss_id" TEXT;

-- CreateTable
CREATE TABLE "discount_codes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_id" UUID,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "min_order_cents" INTEGER NOT NULL DEFAULT 0,
    "max_redemptions" INTEGER,
    "redemption_count" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "initial_cents" INTEGER NOT NULL,
    "balance_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_id" UUID,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "external_id" TEXT,
    "tss_id" TEXT,
    "client_id" TEXT,
    "process_type" TEXT,
    "signature_value" TEXT,
    "signature_counter" INTEGER,
    "qr_code_data" TEXT,
    "certificate_serial" TEXT,
    "time_start" TIMESTAMP(3),
    "time_end" TIMESTAMP(3),
    "raw" JSONB NOT NULL DEFAULT '{}',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_office_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "closed_by_user_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opening_cash_cents" INTEGER NOT NULL DEFAULT 0,
    "closing_cash_cents" INTEGER,
    "expected_cash_cents" INTEGER,
    "difference_cents" INTEGER,
    "notes" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "box_office_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discount_codes_organization_id_active_idx" ON "discount_codes"("organization_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_organization_id_code_key" ON "discount_codes"("organization_id", "code");

-- CreateIndex
CREATE INDEX "gift_cards_organization_id_status_idx" ON "gift_cards"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_organization_id_code_key" ON "gift_cards"("organization_id", "code");

-- CreateIndex
CREATE INDEX "fiscal_transactions_order_id_idx" ON "fiscal_transactions"("order_id");

-- CreateIndex
CREATE INDEX "fiscal_transactions_organization_id_created_at_idx" ON "fiscal_transactions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "box_office_sessions_organization_id_status_idx" ON "box_office_sessions"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_transactions" ADD CONSTRAINT "fiscal_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_transactions" ADD CONSTRAINT "fiscal_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_office_sessions" ADD CONSTRAINT "box_office_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
