/** One-off / idempotent patch for public + billing company address columns. */
const { PrismaClient } = require("@prisma/client");

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

async function main() {
  const url =
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL;
  if (!url) {
    console.error("NO_DB_URL");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    for (const sql of STATEMENTS) {
      await prisma.$executeRawUnsafe(sql);
      console.log("ok:", sql.slice(0, 72).replace(/\s+/g, " "));
    }
    const rows = await prisma.$queryRawUnsafe(
      `SELECT public_company_address, billing_company_address FROM organization_settings LIMIT 1`,
    );
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
