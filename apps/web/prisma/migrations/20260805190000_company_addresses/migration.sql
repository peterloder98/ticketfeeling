-- Public vs billing company addresses on organization_settings
ALTER TABLE "organization_settings"
  ADD COLUMN IF NOT EXISTS "public_company_address" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "billing_company_address" JSONB NOT NULL DEFAULT '{}';

-- Ticketfeeling defaults: public = Landshut, billing = Altdorf (Konradinstr.)
UPDATE "organization_settings"
SET
  "public_company_address" = jsonb_build_object(
    'street', COALESCE(NULLIF(TRIM("street"), ''), 'Innere Münchener Str.'),
    'houseNumber', COALESCE(NULLIF(TRIM("house_number"), ''), '36'),
    'postalCode', COALESCE(NULLIF(TRIM("postal_code"), ''), '84028'),
    'city', COALESCE(NULLIF(TRIM("city"), ''), 'Landshut'),
    'country', COALESCE(NULLIF(TRIM("country"), ''), 'DE')
  ),
  "billing_company_address" = jsonb_build_object(
    'street', 'Konradinstr.',
    'houseNumber', '6',
    'postalCode', '84032',
    'city', 'Altdorf',
    'country', 'DE'
  )
WHERE
  "public_company_address" = '{}'::jsonb
  OR "billing_company_address" = '{}'::jsonb;
