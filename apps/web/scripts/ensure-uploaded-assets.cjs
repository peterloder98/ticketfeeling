/**
 * Ensures cover storage table exists on deploy (Vercel has no local uploads dir).
 * Safe to re-run; does not replace full migrate history.
 */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "uploaded_assets" (
        "id" UUID NOT NULL,
        "organization_id" UUID NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'cover',
        "mime_type" TEXT NOT NULL,
        "byte_size" INTEGER NOT NULL,
        "data" BYTEA NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uploaded_assets_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "uploaded_assets_organization_id_kind_idx"
      ON "uploaded_assets"("organization_id", "kind")
    `);
    console.log("[ensure-uploaded-assets] ok");
  } catch (error) {
    console.warn(
      "[ensure-uploaded-assets] skipped:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main();
