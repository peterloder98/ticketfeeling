import type { PrismaClient } from "@prisma/client";
import { withTimeoutFallback } from "@/lib/async-timeout";

const STATEMENTS = [
  `ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "public_company_address" JSONB NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "billing_company_address" JSONB NOT NULL DEFAULT '{}'`,
  `UPDATE "organization_settings"
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
   WHERE "public_company_address" = '{}'::jsonb
      OR "billing_company_address" = '{}'::jsonb`,
];

let ensurePromise: Promise<void> | null = null;
const ENSURE_BUDGET_MS = 8_000;

/** Idempotent DDL so Prisma Client can load settings after deploy before migrate catches up. */
export async function ensureCompanyAddressSchema(db: PrismaClient) {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      for (const sql of STATEMENTS) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (error) {
          console.error(
            "[company-address] ensureCompanyAddressSchema failed",
            sql.slice(0, 80),
            error,
          );
          ensurePromise = null;
          throw error;
        }
      }
    })();
  }

  await withTimeoutFallback(
    ensurePromise,
    ENSURE_BUDGET_MS,
    undefined,
    "ensureCompanyAddressSchema",
  );
}
