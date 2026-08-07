import { prisma } from "@/lib/db";

let ensured = false;

/** Additive column for optional Print@Home ticket cover override. */
export async function ensureTicketHeroImageColumn() {
  if (ensured) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ticket_hero_image_url" TEXT`,
    );
    ensured = true;
  } catch (err) {
    console.error("[ensureTicketHeroImageColumn]", err);
  }
}
