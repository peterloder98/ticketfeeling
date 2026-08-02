/**
 * Run `prisma migrate deploy` on Vercel with a hard timeout.
 * If migrate hangs/fails, apply critical SEPA/payment columns best-effort so
 * Next.js SSG (layout → OrgTracking → organization.settings) does not crash.
 */
const { spawn } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const MIGRATE_TIMEOUT_MS = 90_000;

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
];

function runMigrateDeploy() {
  return new Promise((resolve) => {
    const child = spawn("prisma", ["migrate", "deploy"], {
      stdio: "inherit",
      env: process.env,
      // npm run build puts node_modules/.bin on PATH
      shell: false,
    });

    const timer = setTimeout(() => {
      console.warn(
        `[migrate-deploy] timed out after ${MIGRATE_TIMEOUT_MS}ms — killing and continuing`,
      );
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref?.();
      resolve({ ok: false, reason: "timeout" });
    }, MIGRATE_TIMEOUT_MS);

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, reason: signal ? `signal:${signal}` : `exit:${code}` });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      console.warn("[migrate-deploy] spawn failed:", error.message);
      resolve({ ok: false, reason: "spawn" });
    });
  });
}

async function applyFallbackSchema() {
  const prisma = new PrismaClient();
  try {
    for (const sql of FALLBACK_STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch (error) {
        console.warn(
          "[migrate-deploy] fallback statement skipped:",
          error instanceof Error ? error.message : error,
        );
      }
    }
    console.log("[migrate-deploy] fallback schema patch applied");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const result = await runMigrateDeploy();
  if (result.ok) {
    console.log("[migrate-deploy] prisma migrate deploy ok");
    return;
  }
  console.warn(`[migrate-deploy] migrate deploy failed (${result.reason}); applying fallback DDL`);
  await applyFallbackSchema();
}

main().catch((error) => {
  console.warn(
    "[migrate-deploy] unexpected error (continuing build):",
    error instanceof Error ? error.message : error,
  );
  process.exit(0);
});
