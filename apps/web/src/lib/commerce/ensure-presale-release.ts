import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

/**
 * Auto „Im Verkauf“ (announcement → presale_active) when Vorverkaufsstart is reached.
 *
 * Triggers (any one is enough — must not fail silently):
 * 1. Save — statusAfterPresaleStart() in create/update event actions
 * 2. Page open — ensurePresaleAutoRelease() on admin event detail + public/embed event pages
 * 3. Surfaces that list sellable events — releaseDuePresales() on admin events list + Tageskasse
 * 4. Cron — GET /api/v1/cron/release-presale (daily on Hobby; releaseDuePresales under the hood)
 *
 * Reads also use effectiveEventStatus() so shop/listings treat due announcements as on sale
 * even before the DB row is flipped.
 */

export async function ensurePresaleAutoRelease(event: {
  id: string;
  organizationId: string;
  status: string;
  presaleStartsAt: Date | null;
}): Promise<{ status: string; flipped: boolean }> {
  if (
    event.status !== "announcement" ||
    !event.presaleStartsAt ||
    event.presaleStartsAt.getTime() > Date.now()
  ) {
    return { status: event.status, flipped: false };
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { status: "presale_active" },
  });
  await writeAudit({
    organizationId: event.organizationId,
    actorUserId: null,
    action: "event.presale_auto_released",
    entityType: "event",
    entityId: event.id,
    before: { status: "announcement", presaleStartsAt: event.presaleStartsAt },
    after: { status: "presale_active", presaleStartsAt: event.presaleStartsAt },
  });
  return { status: "presale_active", flipped: true };
}

/**
 * Batch-flip all due announcement events (optionally scoped to one org).
 * Used by cron, admin event list, and Tageskasse so DB status cannot lag forever.
 */
export async function releaseDuePresales(opts?: {
  organizationId?: string;
  take?: number;
}): Promise<{ checked: number; flipped: number; at: string }> {
  const now = new Date();
  const take = opts?.take ?? 200;
  const due = await prisma.event.findMany({
    where: {
      status: "announcement",
      presaleStartsAt: { lte: now },
      ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
    },
    select: { id: true, organizationId: true, presaleStartsAt: true },
    take,
  });

  let flipped = 0;
  for (const ev of due) {
    const result = await ensurePresaleAutoRelease({
      id: ev.id,
      organizationId: ev.organizationId,
      status: "announcement",
      presaleStartsAt: ev.presaleStartsAt,
    });
    if (result.flipped) flipped += 1;
  }

  return { checked: due.length, flipped, at: now.toISOString() };
}
