-- Durable job queue + email delivery tracking for self-healing ops

CREATE TABLE IF NOT EXISTS "background_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "type" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 8,
    "last_error_kind" TEXT,
    "last_error" TEXT,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "background_jobs_dedupe_key_key" ON "background_jobs"("dedupe_key");
CREATE INDEX IF NOT EXISTS "background_jobs_status_run_after_idx" ON "background_jobs"("status", "run_after");
CREATE INDEX IF NOT EXISTS "background_jobs_type_status_idx" ON "background_jobs"("type", "status");
CREATE INDEX IF NOT EXISTS "background_jobs_organization_id_status_created_at_idx" ON "background_jobs"("organization_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "email_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "to_email" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "order_id" UUID,
    "job_id" UUID,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "bounced_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_deliveries_status_created_at_idx" ON "email_deliveries"("status", "created_at");
CREATE INDEX IF NOT EXISTS "email_deliveries_organization_id_status_idx" ON "email_deliveries"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "email_deliveries_order_id_idx" ON "email_deliveries"("order_id");
CREATE INDEX IF NOT EXISTS "email_deliveries_to_email_status_idx" ON "email_deliveries"("to_email", "status");

ALTER TABLE "forgotten_ticket_requests" ADD COLUMN IF NOT EXISTS "last_name_hint" TEXT;
