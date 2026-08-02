-- SEPA: hide closer than 14 days before event (chargeback / return risk).
ALTER TABLE "organization_settings"
  ALTER COLUMN "sepa_min_days_before_event" SET DEFAULT 14;

UPDATE "organization_settings"
SET "sepa_min_days_before_event" = 14
WHERE "sepa_min_days_before_event" = 7;
