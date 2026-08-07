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
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "status_before_pause" TEXT`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sale_closed_early" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "schedule_changed_at" TIMESTAMP(3)`,
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
  // Venue plan category slots (migration 20260803140000)
  `ALTER TABLE "venue_plans" ADD COLUMN IF NOT EXISTS "category_slots" JSONB NOT NULL DEFAULT '[]'`,
  // Invoice PDF storage (migration 20260803093000)
  `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_data" BYTEA`,
  `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_filename" TEXT`,
  `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pdf_emailed_at" TIMESTAMP(3)`,
  // Public vs billing company addresses (migration 20260805190000)
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
  // Stripe payout reconciliation (migration 20260805180000) — CREATE TABLE missing from
  // earlier fallback DDL caused Finanzen Application errors on Vercel.
  `CREATE TABLE IF NOT EXISTS "stripe_payouts" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "stripe_payout_id" TEXT NOT NULL,
    "stripe_account_id" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'live',
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" TEXT NOT NULL,
    "method" TEXT,
    "type" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "arrival_date" TIMESTAMP(3),
    "created_at_stripe" TIMESTAMP(3),
    "paid_at_stripe" TIMESTAMP(3),
    "failed_at_stripe" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "destination_last4" TEXT,
    "transaction_reconciliation_status" TEXT NOT NULL DEFAULT 'announced',
    "transaction_reconciliation_completed_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMP(3),
    "import_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_import_error" TEXT,
    "reconciliation_difference_cents" INTEGER,
    "balance_transaction_count" INTEGER NOT NULL DEFAULT 0,
    "pagination_complete" BOOLEAN NOT NULL DEFAULT false,
    "document_status" TEXT NOT NULL DEFAULT 'draft',
    "finalized_at" TIMESTAMP(3),
    "finalized_by_user_id" UUID,
    "lexoffice_status" TEXT NOT NULL DEFAULT 'none',
    "lexoffice_marked_at" TIMESTAMP(3),
    "lexoffice_reference" TEXT,
    "admin_note" TEXT,
    "summary_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stripe_payouts_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "stripe_payouts_stripe_payout_id_key" ON "stripe_payouts"("stripe_payout_id")`,
  `CREATE INDEX IF NOT EXISTS "stripe_payouts_organization_id_arrival_date_idx" ON "stripe_payouts"("organization_id", "arrival_date")`,
  `CREATE INDEX IF NOT EXISTS "stripe_payouts_transaction_reconciliation_status_last_synced_at_idx" ON "stripe_payouts"("transaction_reconciliation_status", "last_synced_at")`,
  `CREATE INDEX IF NOT EXISTS "stripe_payouts_document_status_idx" ON "stripe_payouts"("document_status")`,
  `CREATE TABLE IF NOT EXISTS "stripe_balance_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "stripe_balance_transaction_id" TEXT NOT NULL,
    "stripe_payout_id" TEXT,
    "local_payout_id" UUID,
    "stripe_source_id" TEXT,
    "stripe_source_type" TEXT,
    "stripe_charge_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "stripe_refund_id" TEXT,
    "stripe_dispute_id" TEXT,
    "ticketfeeling_order_id" UUID,
    "ticketfeeling_invoice_id" UUID,
    "type" TEXT NOT NULL,
    "reporting_category" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL DEFAULT 0,
    "net_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "exchange_rate" DECIMAL(18,10),
    "available_on" TIMESTAMP(3),
    "created_at_stripe" TIMESTAMP(3),
    "description" TEXT,
    "classification" TEXT NOT NULL DEFAULT 'unknown',
    "mapping_status" TEXT NOT NULL DEFAULT 'pending',
    "raw_stripe_object" JSONB,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stripe_balance_transactions_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "stripe_balance_transactions_stripe_balance_transaction_id_key" ON "stripe_balance_transactions"("stripe_balance_transaction_id")`,
  `CREATE INDEX IF NOT EXISTS "stripe_balance_transactions_local_payout_id_idx" ON "stripe_balance_transactions"("local_payout_id")`,
  `CREATE INDEX IF NOT EXISTS "stripe_balance_transactions_stripe_payout_id_idx" ON "stripe_balance_transactions"("stripe_payout_id")`,
  `CREATE INDEX IF NOT EXISTS "stripe_balance_transactions_stripe_payment_intent_id_idx" ON "stripe_balance_transactions"("stripe_payment_intent_id")`,
  `CREATE INDEX IF NOT EXISTS "stripe_balance_transactions_stripe_charge_id_idx" ON "stripe_balance_transactions"("stripe_charge_id")`,
  `CREATE INDEX IF NOT EXISTS "stripe_balance_transactions_ticketfeeling_order_id_idx" ON "stripe_balance_transactions"("ticketfeeling_order_id")`,
  `CREATE INDEX IF NOT EXISTS "stripe_balance_transactions_classification_mapping_status_idx" ON "stripe_balance_transactions"("classification", "mapping_status")`,
  `CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'live',
    "object_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_status" TEXT NOT NULL DEFAULT 'received',
    "processed_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "payload_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "stripe_webhook_events_stripe_event_id_key" ON "stripe_webhook_events"("stripe_event_id")`,
  `CREATE INDEX IF NOT EXISTS "stripe_webhook_events_processing_status_received_at_idx" ON "stripe_webhook_events"("processing_status", "received_at")`,
  `CREATE INDEX IF NOT EXISTS "stripe_webhook_events_event_type_received_at_idx" ON "stripe_webhook_events"("event_type", "received_at")`,
  `CREATE TABLE IF NOT EXISTS "payout_document_sequences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "document_type" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "prefix" TEXT NOT NULL DEFAULT 'TF-PO',
    CONSTRAINT "payout_document_sequences_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "payout_document_sequences_organization_id_year_document_type_key" ON "payout_document_sequences"("organization_id", "year", "document_type")`,
  `CREATE TABLE IF NOT EXISTS "payout_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "local_payout_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_number" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'preview',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by_user_id" UUID,
    "checksum_sha256" TEXT,
    "immutable_storage_path" TEXT,
    "pdf_data" BYTEA,
    "supersedes_document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payout_documents_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "payout_documents_local_payout_id_document_type_idx" ON "payout_documents"("local_payout_id", "document_type")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "payout_documents_organization_id_document_number_key" ON "payout_documents"("organization_id", "document_number")`,
  `CREATE TABLE IF NOT EXISTS "payout_audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "local_payout_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "actor_type" TEXT NOT NULL DEFAULT 'system',
    "actor_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payout_audit_logs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "payout_audit_logs_local_payout_id_created_at_idx" ON "payout_audit_logs"("local_payout_id", "created_at")`,
  `CREATE TABLE IF NOT EXISTS "stripe_original_uploads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "local_payout_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "period_label" TEXT,
    "notes" TEXT,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stripe_original_uploads_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "stripe_original_uploads_organization_id_local_payout_id_idx" ON "stripe_original_uploads"("organization_id", "local_payout_id")`,
  `CREATE TABLE IF NOT EXISTS "stripe_payout_reconcile_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "kind" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "lookback_days" INTEGER NOT NULL,
    "payouts_seen" INTEGER NOT NULL DEFAULT 0,
    "payouts_updated" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "summary_json" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "stripe_payout_reconcile_runs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "stripe_payout_reconcile_runs_started_at_idx" ON "stripe_payout_reconcile_runs"("started_at")`,
  // Staff invites (migration 20260806120000) — without this, /admin/benutzer 500s on
  // soft navigation when prisma migrate deploy is skipped on Vercel builds.
  `CREATE TABLE IF NOT EXISTS "staff_invites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role_key" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_by_user_id" UUID NOT NULL,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "staff_invites_token_hash_key" ON "staff_invites"("token_hash")`,
  `CREATE INDEX IF NOT EXISTS "staff_invites_organization_id_status_idx" ON "staff_invites"("organization_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "staff_invites_email_normalized_idx" ON "staff_invites"("email_normalized")`,
  // Seat optimization + segment adjacency (migration 20260807190000)
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_prefer_contiguous" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_prevent_new_singletons" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_intelligent_remnants" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seat_opt_gap_relax_occupancy_percent" INTEGER NOT NULL DEFAULT 90`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "segment_index" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "position_in_segment" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "seat_type" TEXT NOT NULL DEFAULT 'standard'`,
  `ALTER TABLE "event_seats" ADD COLUMN IF NOT EXISTS "companion_of_seat_key" TEXT`,
  `CREATE INDEX IF NOT EXISTS "event_seats_event_id_segment_idx" ON "event_seats"("event_id", "block_object_id", "row_index", "segment_index")`,
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

function isLocalDatabaseUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return /@localhost(?::\d+)?\//i.test(url) || /@127\.0\.0\.1(?::\d+)?\//i.test(url);
  }
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

  // CLI deploys can accidentally ship a local .env; Vercel project env must be real Postgres.
  if (process.env.VERCEL && isLocalDatabaseUrl(url)) {
    console.warn(
      "[migrate-deploy] DATABASE_URL points at localhost on Vercel — skipping schema patch. Set Production DATABASE_URL on the ticketfeeling-web project (not a duplicate/local URL).",
    );
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
