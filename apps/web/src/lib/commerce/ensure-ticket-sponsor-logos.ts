import { prisma } from "@/lib/db";

let ensured = false;

/** Additive columns for optional Print@Home QR-stub sponsor logos + scale. */
export async function ensureTicketSponsorLogoColumns() {
  if (ensured) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_above_url" TEXT`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_below_url" TEXT`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_above_scale" DOUBLE PRECISION`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_below_scale" DOUBLE PRECISION`,
    );
    ensured = true;
  } catch (err) {
    console.error("[ensureTicketSponsorLogoColumns]", err);
  }
}
