import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { PRESALE_AUTO_RELEASE_STATUSES } from "@/lib/commerce/event-sale";

/**
 * Auto „Im Verkauf“ (announcement/draft → presale_active) when Vorverkaufsstart is reached.
 *
 * Triggers (any one is enough — must not fail silently):
 * 1. Save — resolvePersistedEventStatus() / statusAfterPresaleStart() in create/update
 * 2. Page open — ensurePresaleAutoRelease() on admin event detail + public/embed event pages
 * 3. Public + admin listings — releaseDuePresales() on homepage, /events, embed shop, admin, Kasse
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
    !(PRESALE_AUTO_RELEASE_STATUSES as readonly string[]).includes(event.status) ||
    !event.presaleStartsAt ||
    event.presaleStartsAt.getTime() > Date.now()
  ) {
    return { status: event.status, flipped: false };
  }

  const beforeStatus = event.status;
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
    before: { status: beforeStatus, presaleStartsAt: event.presaleStartsAt },
    after: { status: "presale_active", presaleStartsAt: event.presaleStartsAt },
  });
  return { status: "presale_active", flipped: true };
}

/**
 * Batch-flip all due announcement/draft events (optionally scoped to one org).
 * Used by cron, public listings, admin event list, and Tageskasse so DB status cannot lag.
 *
 * Drafts with a reached Vorverkaufsstart are recovered too — leaving them as Entwurf while
 * a public sale start is in the past is the main reason events vanish from Startseite/Events.
 */
export async function releaseDuePresales(opts?: {
  organizationId?: string;
  take?: number;
}): Promise<{ checked: number; flipped: number; at: string }> {
  const now = new Date();
  const take = opts?.take ?? 200;
  const due = await prisma.event.findMany({
    where: {
      status: { in: [...PRESALE_AUTO_RELEASE_STATUSES] },
      presaleStartsAt: { lte: now },
      ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
    },
    select: { id: true, organizationId: true, status: true, presaleStartsAt: true },
    take,
  });

  let flipped = 0;
  for (const ev of due) {
    const result = await ensurePresaleAutoRelease({
      id: ev.id,
      organizationId: ev.organizationId,
      status: ev.status,
      presaleStartsAt: ev.presaleStartsAt,
    });
    if (result.flipped) flipped += 1;
  }

  return { checked: due.length, flipped, at: now.toISOString() };
}
