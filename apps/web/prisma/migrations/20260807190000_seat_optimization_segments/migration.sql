-- Sitzplatzoptimierung toggles on events (defaults ON / 90% relax)
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_prefer_contiguous" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_prevent_new_singletons" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_intelligent_remnants" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_gap_relax_occupancy_percent" INTEGER NOT NULL DEFAULT 90;

-- Segment adjacency + seat type on event_seats (legacy rows → segment 0, position = seat_index-1)
ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "segment_index" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "position_in_segment" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "seat_type" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "companion_of_seat_key" TEXT;

UPDATE "event_seats"
SET "position_in_segment" = GREATEST(0, "seat_index" - 1)
WHERE "position_in_segment" = 0 AND "seat_index" > 1 AND "seat_key" NOT LIKE '%:ST:%';

CREATE INDEX IF NOT EXISTS "event_seats_event_id_segment_idx"
  ON "event_seats"("event_id", "block_object_id", "row_index", "segment_index");
