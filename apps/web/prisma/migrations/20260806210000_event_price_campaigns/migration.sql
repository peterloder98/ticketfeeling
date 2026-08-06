-- Optional accessibility discount per event
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_label" TEXT NOT NULL DEFAULT 'Rollstuhl / Ermäßigt';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_description" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_type" TEXT NOT NULL DEFAULT 'percent';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_value" INTEGER NOT NULL DEFAULT 0;

-- Time-boxed price campaigns (no coupon code)
CREATE TABLE IF NOT EXISTS "event_price_campaigns" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "channels" TEXT NOT NULL DEFAULT 'both',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_price_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "event_price_campaign_categories" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    CONSTRAINT "event_price_campaign_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_price_campaign_categories_campaign_id_category_id_key"
  ON "event_price_campaign_categories"("campaign_id", "category_id");
CREATE INDEX IF NOT EXISTS "event_price_campaign_categories_category_id_idx"
  ON "event_price_campaign_categories"("category_id");
CREATE INDEX IF NOT EXISTS "event_price_campaigns_event_id_active_valid_from_valid_until_idx"
  ON "event_price_campaigns"("event_id", "active", "valid_from", "valid_until");

DO $$ BEGIN
  ALTER TABLE "event_price_campaigns"
    ADD CONSTRAINT "event_price_campaigns_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "event_price_campaign_categories"
    ADD CONSTRAINT "event_price_campaign_categories_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "event_price_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "event_price_campaign_categories"
    ADD CONSTRAINT "event_price_campaign_categories_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "event_ticket_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cart line pricing snapshots
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "unit_list_gross_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "accessibility_selected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "price_campaign_id" UUID;
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "price_campaign_name" TEXT;
