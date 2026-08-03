/**
 * Best-effort schema patch on Vercel build.
 * Avoid hanging `prisma migrate deploy` (Neon pooler / lock waits can stall the whole deploy).
 * Critical columns are applied with short-timeout DDL instead.
 */
const { PrismaClient } = require("@prisma/client");

const DDL_TIMEOUT_MS = 20_000;

const FALLBACK_STATEMENTS = [
  `ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "payment_ui_config" JSONB NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sepa_min_days_before_event" INTEGER`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_payment_method_id" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stripe_mandate_id" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "iban_last4" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "account_holder_name" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reservation_status" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reserved_until" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_processing_at" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_succeeded_at" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ticket_released_at" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "ticket_sent_at" TIMESTAMP(3)`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "failed_reason_code" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "failed_reason_message" TEXT`,
  `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "webhook_processing_version" INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE "inventory_holds" ADD COLUMN IF NOT EXISTS "order_id" UUID`,
  `CREATE INDEX IF NOT EXISTS "inventory_holds_order_id_idx" ON "inventory_holds"("order_id")`,
  `ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "changelog" TEXT`,
  `ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID`,
  // Seat category assignment + locks (migration 20260803090000)
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seating_layout_config" JSONB NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "category_id" UUID`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS "event_seats_event_id_category_id_status_idx" ON "event_seats"("event_id", "category_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "event_seats_event_id_locked_status_idx" ON "event_seats"("event_id", "locked", "status")`,
  // Invoice PDF storage (migration 20260803093000)
  `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_data" BYTEA`,
  `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_filename" TEXT`,
  `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_emailed_at" TIMESTAMP(3)`,
];

function withTimeout(promise, ms, label) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[migrate-deploy] ${label} timed out after ${ms}ms`);
      resolve({ ok: false, timedOut: true });
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      })
      .catch((error) => {
        clearTimeout(timer);
        resolve({ ok: false, error });
      });
  });
}

async function applyFallbackSchema() {
  const url =
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL;

  if (!url) {
    console.warn("[migrate-deploy] no DATABASE_URL — skipping schema patch");
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    for (const sql of FALLBACK_STATEMENTS) {
      const result = await withTimeout(
        prisma.$executeRawUnsafe(sql),
        DDL_TIMEOUT_MS,
        sql.slice(0, 60),
      );
      if (!result.ok) {
        if (result.error) {
          console.warn(
            "[migrate-deploy] statement skipped:",
            result.error instanceof Error ? result.error.message : result.error,
          );
        }
      }
    }
    console.log("[migrate-deploy] fallback schema patch finished");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  // Full migrate deploy is optional and often hangs on serverless/Neon builds.
  // Prefer fast, idempotent DDL so `next build` always proceeds.
  if (process.env.PRISMA_MIGRATE_DEPLOY === "1") {
    const { spawn } = require("node:child_process");
    await new Promise((resolve) => {
      const child = spawn("npx", ["prisma", "migrate", "deploy"], {
        stdio: "inherit",
        env: process.env,
        shell: true,
      });
      const timer = setTimeout(() => {
        console.warn("[migrate-deploy] prisma migrate deploy timed out — continuing");
        child.kill("SIGTERM");
        resolve();
      }, 45_000);
      child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await applyFallbackSchema();
}

main().catch((error) => {
  console.warn(
    "[migrate-deploy] unexpected error (continuing build):",
    error instanceof Error ? error.message : error,
  );
  process.exit(0);
});
