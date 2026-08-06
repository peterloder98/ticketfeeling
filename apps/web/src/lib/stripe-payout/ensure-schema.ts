import type { PrismaClient } from "@prisma/client";
import { withTimeoutFallback } from "@/lib/async-timeout";

/**
 * Idempotent CREATE TABLE / INDEX for Stripe payout reconciliation.
 * Vercel builds skip full `prisma migrate deploy` unless PRISMA_MIGRATE_DEPLOY=1,
 * so Finanzen pages must self-heal missing tables.
 */
const STRIPE_PAYOUT_SCHEMA_STATEMENTS = [
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
];

const ENSURE_BUDGET_MS = 8_000;

let ensurePromise: Promise<void> | null = null;
let schemaReady = false;

async function probeStripePayoutSchemaReady(db: PrismaClient): Promise<boolean> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'stripe_payouts'
       ) AS exists`,
    );
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

/** Best-effort DDL so Finanzen works before migrate deploy catches up. */
export async function ensureStripePayoutSchema(db: PrismaClient) {
  if (schemaReady) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (await probeStripePayoutSchemaReady(db)) {
        schemaReady = true;
        return;
      }

      let failed = false;
      for (const sql of STRIPE_PAYOUT_SCHEMA_STATEMENTS) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (error) {
          failed = true;
          console.error(
            "[stripe-payout] ensureStripePayoutSchema failed",
            sql.slice(0, 80),
            error,
          );
        }
      }
      if (failed) {
        ensurePromise = null;
        return;
      }
      schemaReady = true;
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  await withTimeoutFallback(
    ensurePromise,
    ENSURE_BUDGET_MS,
    undefined,
    "ensureStripePayoutSchema",
  );
}
