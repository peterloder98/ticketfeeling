-- Category-specific doors (optional override of event doorsOpenAt)
ALTER TABLE "event_ticket_categories" ADD COLUMN IF NOT EXISTS "doors_open_at" TIMESTAMP(3);
ALTER TABLE "event_ticket_categories" ADD COLUMN IF NOT EXISTS "doors_note" TEXT;

-- Per-event organizer overrides (default = OrganizationSettings / seller identity)
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_name" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_contact" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_street" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_house_number" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_postal_code" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_city" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_email" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_phone" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_website" TEXT;

-- Consignment pack tracking: assigned (pre-printed, not finally sold) vs sold
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "consignment_state" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "consignment_sold_at" TIMESTAMP(3);
