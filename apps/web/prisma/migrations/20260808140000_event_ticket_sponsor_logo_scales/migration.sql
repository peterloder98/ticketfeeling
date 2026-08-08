-- Admin-controlled display scale for QR-stub sponsor logos (0.45–1).
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_above_scale" DOUBLE PRECISION;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_below_scale" DOUBLE PRECISION;
