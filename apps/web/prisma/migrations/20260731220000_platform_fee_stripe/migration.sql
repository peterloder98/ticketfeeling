-- Platform fee (Verwaltungsgebühr) + Stripe / Lexoffice order fields

ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "platform_fee_config" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "stripe_fee_config" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "sepa_ticket_release_mode" TEXT NOT NULL DEFAULT 'after_confirmed',
  ADD COLUMN IF NOT EXISTS "sepa_min_days_before_event" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "ticket_tax_rate_basis_points" INTEGER NOT NULL DEFAULT 700,
  ADD COLUMN IF NOT EXISTS "administration_fee_tax_mode" TEXT NOT NULL DEFAULT 'inherit',
  ADD COLUMN IF NOT EXISTS "administration_fee_custom_tax_rate_bps" INTEGER;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "admin_fee_percentage_bps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "admin_fee_gross_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "admin_fee_net_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "admin_fee_tax_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "admin_fee_tax_allocations" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "calculation_version" TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_charge_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_balance_transaction_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_fee_estimated_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "stripe_fee_actual_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "stripe_net_payout_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "sepa_mandate_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_requested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "invoice_recipient_type" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_company_name" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_contact_name" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_vat_id" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_order_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_street" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_house_number" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_postal_code" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_city" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_country" TEXT,
  ADD COLUMN IF NOT EXISTS "lexoffice_voucher_id" TEXT,
  ADD COLUMN IF NOT EXISTS "lexoffice_sync_status" TEXT,
  ADD COLUMN IF NOT EXISTS "lexoffice_synced_at" TIMESTAMP(3);

-- Backfill admin fee columns from legacy fee_* where present
UPDATE "orders"
SET
  "admin_fee_gross_cents" = "fee_gross_cents",
  "admin_fee_net_cents" = "fee_net_cents",
  "admin_fee_tax_cents" = "fee_tax_cents"
WHERE "admin_fee_gross_cents" = 0 AND "fee_gross_cents" > 0;

-- Seed default 3% Verwaltungsgebühr for orgs without config
UPDATE "organization_settings"
SET "platform_fee_config" = jsonb_build_object(
  'enabled', true,
  'percentageBasisPoints', 300,
  'displayName', 'Verwaltungsgebühr',
  'calculationBase', 'ticket_subtotal_after_discounts',
  'taxMode', 'inherit_ticket_tax_rate',
  'customerDescription',
    'Die Verwaltungsgebühr unterstützt den sicheren Betrieb, die Zahlungsabwicklung, die Ticketbereitstellung und unseren persönlichen Kundenservice. Mit 3 % bleibt Ticketfeeling bewusst deutlich unter den Gebühren vieler klassischer Ticketanbieter.',
  'version', 1
)
WHERE "platform_fee_config" = '{}'::jsonb OR "platform_fee_config" IS NULL;
