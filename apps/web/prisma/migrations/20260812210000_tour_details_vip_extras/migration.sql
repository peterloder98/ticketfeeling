-- Tour Kurzbeschreibung (inherited by events when details_use_tour_defaults)
ALTER TABLE "tours" ADD COLUMN IF NOT EXISTS "short_description" TEXT;

-- Event inherits tour name / shortDescription / description when true
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "details_use_tour_defaults" BOOLEAN NOT NULL DEFAULT true;

-- VIP short extras blurb (in addition to longer category description)
ALTER TABLE "event_ticket_categories" ADD COLUMN IF NOT EXISTS "extras_short_text" TEXT;

-- Backfill tour short_description from earliest dated event on that tour (idempotent)
UPDATE "tours" t
SET "short_description" = src.short_description
FROM (
  SELECT DISTINCT ON (e.tour_id)
    e.tour_id,
    e.short_description
  FROM "events" e
  WHERE e.tour_id IS NOT NULL
    AND e.short_description IS NOT NULL
    AND length(trim(e.short_description)) > 0
  ORDER BY e.tour_id, e.event_starts_at ASC NULLS LAST, e.created_at ASC
) src
WHERE t.id = src.tour_id
  AND (t.short_description IS NULL OR length(trim(t.short_description)) = 0);
