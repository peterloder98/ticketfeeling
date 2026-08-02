-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_emailed_at" TIMESTAMP(3),
ADD COLUMN     "delivery_printed_at" TIMESTAMP(3),
ADD COLUMN     "delivery_status" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "sold_by_user_id" UUID,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by_user_id" UUID;

-- CreateTable
CREATE TABLE "ticket_category_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_gross_cents" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "max_per_order" INTEGER NOT NULL DEFAULT 10,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_category_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_office_invites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
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

    CONSTRAINT "box_office_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_office_invite_events" (
    "id" UUID NOT NULL,
    "invite_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,

    CONSTRAINT "box_office_invite_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_office_seller_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "box_office_seller_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_category_templates_organization_id_sort_order_idx" ON "ticket_category_templates"("organization_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "box_office_invites_token_hash_key" ON "box_office_invites"("token_hash");

-- CreateIndex
CREATE INDEX "box_office_invites_organization_id_status_idx" ON "box_office_invites"("organization_id", "status");

-- CreateIndex
CREATE INDEX "box_office_invites_email_normalized_idx" ON "box_office_invites"("email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "box_office_invite_events_invite_id_event_id_key" ON "box_office_invite_events"("invite_id", "event_id");

-- CreateIndex
CREATE INDEX "box_office_seller_grants_organization_id_user_id_idx" ON "box_office_seller_grants"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "box_office_seller_grants_user_id_event_id_key" ON "box_office_seller_grants"("user_id", "event_id");

-- CreateIndex
CREATE INDEX "orders_sold_by_user_id_created_at_idx" ON "orders"("sold_by_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "ticket_category_templates" ADD CONSTRAINT "ticket_category_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_office_invites" ADD CONSTRAINT "box_office_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_office_invites" ADD CONSTRAINT "box_office_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_office_invites" ADD CONSTRAINT "box_office_invites_accepted_user_id_fkey" FOREIGN KEY ("accepted_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_office_invite_events" ADD CONSTRAINT "box_office_invite_events_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "box_office_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_office_invite_events" ADD CONSTRAINT "box_office_invite_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_office_seller_grants" ADD CONSTRAINT "box_office_seller_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_office_seller_grants" ADD CONSTRAINT "box_office_seller_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_office_seller_grants" ADD CONSTRAINT "box_office_seller_grants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sold_by_user_id_fkey" FOREIGN KEY ("sold_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
