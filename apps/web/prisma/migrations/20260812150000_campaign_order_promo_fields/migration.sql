-- Order-threshold promos + public badge copy on event price campaigns
ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "apply_mode" TEXT NOT NULL DEFAULT 'unit';
ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "min_quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "badge_label" TEXT;
ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "badge_disclaimer" TEXT;
