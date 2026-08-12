-- Link identical Preisaktionen across tour sibling events
ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "campaign_group_id" UUID;
CREATE INDEX IF NOT EXISTS "event_price_campaigns_campaign_group_id_idx"
  ON "event_price_campaigns"("campaign_group_id");
