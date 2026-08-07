-- Optional ticket-only cover override (Print@Home / ticket face). Null = use event/tour cover.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_hero_image_url" TEXT;
