-- Weihnachtstraum 2026 dates are final (incl. Löwenberg). Drop public schedule-change banner.
UPDATE "events"
SET "schedule_changed_at" = NULL
WHERE "slug" LIKE 'schlagerfeeling-weihnachtstraum-2026-%'
  AND "schedule_changed_at" IS NOT NULL;
