/**
 * Aggressive cleanup for schlagerfeeling org (Ticketfeeling).
 * See `src/lib/admin/purge-test-commerce.ts` for behaviour.
 *
 * Usage:
 *   cd apps/web && npx tsx scripts/purge-test-commerce.ts --dry-run
 *   cd apps/web && npx tsx scripts/purge-test-commerce.ts
 *
 * Prefer Admin → System → Aufräumen in production (uses Vercel DATABASE_URL).
 */
import { PrismaClient } from "@prisma/client";
import { purgeTestCommerce } from "../src/lib/admin/purge-test-commerce";

const prisma = new PrismaClient();

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — pull Vercel env first for production.");
    process.exit(1);
  }

  console.log(`[purge] host=${hostOf(process.env.DATABASE_URL)} dryRun=${dryRun}`);
  await purgeTestCommerce(prisma, { dryRun, log: (msg) => console.log(msg) });
}

main()
  .catch((err) => {
    console.error("[purge] failed", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
