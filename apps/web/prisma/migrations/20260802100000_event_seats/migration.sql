-- CreateTable
CREATE TABLE "event_seats" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "venue_plan_id" UUID NOT NULL,
    "block_object_id" TEXT NOT NULL,
    "block_label" TEXT NOT NULL,
    "row_index" INTEGER NOT NULL,
    "seat_index" INTEGER NOT NULL,
    "row_label" TEXT NOT NULL,
    "seat_number" TEXT NOT NULL,
    "seat_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "hold_expires_at" TIMESTAMP(3),
    "cart_item_id" UUID,
    "ticket_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_seats_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN "seating_mode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "event_seats_ticket_id_key" ON "event_seats"("ticket_id");

-- CreateIndex
CREATE INDEX "event_seats_event_id_status_idx" ON "event_seats"("event_id", "status");

-- CreateIndex
CREATE INDEX "event_seats_cart_item_id_idx" ON "event_seats"("cart_item_id");

-- CreateIndex
CREATE INDEX "event_seats_hold_expires_at_idx" ON "event_seats"("hold_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_seats_event_id_seat_key_key" ON "event_seats"("event_id", "seat_key");

-- AddForeignKey
ALTER TABLE "event_seats" ADD CONSTRAINT "event_seats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_seats" ADD CONSTRAINT "event_seats_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "cart_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_seats" ADD CONSTRAINT "event_seats_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
