-- AlterTable Event
ALTER TABLE "events" ADD COLUMN "seating_booking_mode" TEXT NOT NULL DEFAULT 'none';

-- AlterTable EventTicketCategory
ALTER TABLE "event_ticket_categories" ADD COLUMN "category_kind" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "event_ticket_categories" ADD COLUMN "companion_free" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Ticket
ALTER TABLE "tickets" ADD COLUMN "seat_label" TEXT;
ALTER TABLE "tickets" ADD COLUMN "seat_row" TEXT;
ALTER TABLE "tickets" ADD COLUMN "seat_number" TEXT;
ALTER TABLE "tickets" ADD COLUMN "block_label" TEXT;
