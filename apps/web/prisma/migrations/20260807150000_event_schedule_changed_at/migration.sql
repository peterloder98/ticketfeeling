-- Persist when Beginn was changed on a live event (public banner + buyer notify trail).
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "schedule_changed_at" TIMESTAMP(3);
