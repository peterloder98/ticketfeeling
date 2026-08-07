-- Optional sponsor logos on the Print@Home QR stub (above / below QR).
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_above_url" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_below_url" TEXT;
