-- Seat ↔ category assignment + gradual sale locks

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "seating_layout_config" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "event_seats"
  ADD COLUMN IF NOT EXISTS "category_id" UUID,
  ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_seats_category_id_fkey'
  ) THEN
    ALTER TABLE "event_seats"
      ADD CONSTRAINT "event_seats_category_id_fkey"
      FOREIGN KEY ("category_id")
      REFERENCES "event_ticket_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "event_seats_event_id_category_id_status_idx"
  ON "event_seats"("event_id", "category_id", "status");

CREATE INDEX IF NOT EXISTS "event_seats_event_id_locked_status_idx"
  ON "event_seats"("event_id", "locked", "status");
