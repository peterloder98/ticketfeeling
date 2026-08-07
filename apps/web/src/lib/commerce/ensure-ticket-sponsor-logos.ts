import { prisma } from "@/lib/db";

let ensured = false;

/** Additive columns for optional Print@Home QR-stub sponsor logos. */
export async function ensureTicketSponsorLogoColumns() {
  if (ensured) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_above_url" TEXT`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_sponsor_logo_below_url" TEXT`,
    );
    ensured = true;
  } catch (err) {
    console.error("[ensureTicketSponsorLogoColumns]", err);
  }
}
