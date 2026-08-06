-- Early sale end: closes online/box-office sale and unlocks real check-in before doors.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sale_closed_early" BOOLEAN NOT NULL DEFAULT false;
