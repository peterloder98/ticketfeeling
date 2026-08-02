/**
 * One-shot: publish LEGAL_SEED_CATALOG into the connected database.
 * Usage: node --env-file=.env --import tsx ./scripts/sync-legal-catalog.mjs
 */
import { PrismaClient } from "@prisma/client";
import { syncLegalCatalog } from "../src/lib/legal/sync-catalog.ts";

const db = new PrismaClient();
const org = await db.organization.findFirst({
  where: { status: "active" },
  orderBy: { createdAt: "asc" },
});
if (!org) {
  console.error("No active organization");
  process.exit(1);
}
await syncLegalCatalog(org.id, db);
const rows = await db.$queryRawUnsafe(
  `SELECT d.type, v.version, length(v.content) AS len
   FROM legal_document_versions v
   JOIN legal_documents d ON d.id = v.legal_document_id
   WHERE d.organization_id = $1::uuid AND v.status = 'published'
   ORDER BY d.type`,
  org.id,
);
console.log("synced:", rows);
await db.$disconnect();
