-- Named category slots on reusable venue plans (paint-assign in saalplan editor).
ALTER TABLE "venue_plans" ADD COLUMN IF NOT EXISTS "category_slots" JSONB NOT NULL DEFAULT '[]';
