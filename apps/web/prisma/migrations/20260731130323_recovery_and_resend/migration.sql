-- CreateTable
CREATE TABLE "access_recovery_tokens" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_recovery_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_resend_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "channel" TEXT NOT NULL DEFAULT 'account',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_resend_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_recovery_tokens_token_hash_key" ON "access_recovery_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "access_recovery_tokens_organization_id_email_normalized_idx" ON "access_recovery_tokens"("organization_id", "email_normalized");

-- CreateIndex
CREATE INDEX "access_recovery_tokens_expires_at_idx" ON "access_recovery_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "ticket_resend_events_ticket_id_created_at_idx" ON "ticket_resend_events"("ticket_id", "created_at");
