-- Internal tracking sessions, events, and outbound delivery log

CREATE TABLE IF NOT EXISTS "tracking_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_session_id" UUID NOT NULL,
    "visitor_id" TEXT,
    "embed_mode" BOOLEAN NOT NULL DEFAULT false,
    "embed_host" TEXT,
    "parent_url" TEXT,
    "landing_path" TEXT,
    "referrer" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_term" TEXT,
    "utm_content" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "msclkid" TEXT,
    "ttclid" TEXT,
    "ga_client_id" TEXT,
    "ga_session_id" TEXT,
    "fbp" TEXT,
    "fbc" TEXT,
    "consent_statistics" BOOLEAN NOT NULL DEFAULT false,
    "consent_marketing" BOOLEAN NOT NULL DEFAULT false,
    "first_touch" JSONB NOT NULL DEFAULT '{}',
    "last_touch" JSONB NOT NULL DEFAULT '{}',
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracking_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tracking_sessions_organization_id_client_session_id_key"
  ON "tracking_sessions"("organization_id", "client_session_id");
CREATE INDEX IF NOT EXISTS "tracking_sessions_organization_id_last_seen_at_idx"
  ON "tracking_sessions"("organization_id", "last_seen_at");
CREATE INDEX IF NOT EXISTS "tracking_sessions_client_session_id_idx"
  ON "tracking_sessions"("client_session_id");

CREATE TABLE IF NOT EXISTS "tracking_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tracking_session_id" UUID,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'client',
    "category" TEXT NOT NULL DEFAULT 'funnel',
    "order_id" UUID,
    "event_slug" TEXT,
    "transaction_id" TEXT,
    "value_cents" INTEGER,
    "currency" TEXT,
    "consent_required" BOOLEAN NOT NULL DEFAULT true,
    "consent_ok" BOOLEAN NOT NULL DEFAULT true,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tracking_events_event_id_key" ON "tracking_events"("event_id");
CREATE INDEX IF NOT EXISTS "tracking_events_organization_id_name_created_at_idx"
  ON "tracking_events"("organization_id", "name", "created_at");
CREATE INDEX IF NOT EXISTS "tracking_events_order_id_idx" ON "tracking_events"("order_id");
CREATE INDEX IF NOT EXISTS "tracking_events_transaction_id_idx" ON "tracking_events"("transaction_id");
CREATE INDEX IF NOT EXISTS "tracking_events_tracking_session_id_created_at_idx"
  ON "tracking_events"("tracking_session_id", "created_at");

CREATE TABLE IF NOT EXISTS "tracking_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tracking_event_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "provider_response" JSONB,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracking_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tracking_deliveries_dedupe_key_key" ON "tracking_deliveries"("dedupe_key");
CREATE INDEX IF NOT EXISTS "tracking_deliveries_organization_id_status_created_at_idx"
  ON "tracking_deliveries"("organization_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "tracking_deliveries_channel_status_idx"
  ON "tracking_deliveries"("channel", "status");
CREATE INDEX IF NOT EXISTS "tracking_deliveries_tracking_event_id_idx"
  ON "tracking_deliveries"("tracking_event_id");

DO $$ BEGIN
  ALTER TABLE "tracking_sessions"
    ADD CONSTRAINT "tracking_sessions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tracking_events"
    ADD CONSTRAINT "tracking_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tracking_events"
    ADD CONSTRAINT "tracking_events_tracking_session_id_fkey"
    FOREIGN KEY ("tracking_session_id") REFERENCES "tracking_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tracking_deliveries"
    ADD CONSTRAINT "tracking_deliveries_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "tracking_deliveries"
    ADD CONSTRAINT "tracking_deliveries_tracking_event_id_fkey"
    FOREIGN KEY ("tracking_event_id") REFERENCES "tracking_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
