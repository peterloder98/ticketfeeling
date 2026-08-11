/**
 * Upsert Hilfe/FAQ knowledge articles for all active orgs (no full DB seed).
 * Usage: node --import tsx scripts/sync-support-knowledge.mjs
 */
import { PrismaClient } from "@prisma/client";
import { syncSupportKnowledgeForActiveOrgs } from "../src/lib/support/sync-knowledge.ts";

const db = new PrismaClient();

try {
  const count = await syncSupportKnowledgeForActiveOrgs(db);
  console.log(`Synced support knowledge for ${count} active organization(s).`);
} finally {
  await db.$disconnect();
}
