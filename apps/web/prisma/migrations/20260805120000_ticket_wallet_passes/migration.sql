-- Apple / Google Wallet pass tracking + Apple device registrations for push updates

CREATE TABLE "ticket_wallet_passes" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "auth_token" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "update_tag" TEXT,
    "google_class_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "last_pushed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_wallet_passes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "apple_wallet_device_registrations" (
    "id" UUID NOT NULL,
    "device_library_identifier" TEXT NOT NULL,
    "push_token" TEXT NOT NULL,
    "pass_type_identifier" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apple_wallet_device_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_wallet_passes_ticket_id_provider_key" ON "ticket_wallet_passes"("ticket_id", "provider");
CREATE UNIQUE INDEX "ticket_wallet_passes_provider_external_id_key" ON "ticket_wallet_passes"("provider", "external_id");
CREATE INDEX "ticket_wallet_passes_status_idx" ON "ticket_wallet_passes"("status");

CREATE UNIQUE INDEX "apple_wallet_device_registrations_device_library_identifier_pass_type_identifier_serial_number_key" ON "apple_wallet_device_registrations"("device_library_identifier", "pass_type_identifier", "serial_number");
CREATE INDEX "apple_wallet_device_registrations_pass_type_identifier_serial_number_idx" ON "apple_wallet_device_registrations"("pass_type_identifier", "serial_number");

ALTER TABLE "ticket_wallet_passes" ADD CONSTRAINT "ticket_wallet_passes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
