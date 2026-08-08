import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  PRESALE_AUTO_RELEASE_STATUSES,
  canStartSales,
  logSalesActivated,
  logSalesActivationBlocked,
  type CanStartSalesInput,
} from "@/lib/commerce/event-sale";

/**
 * Auto „Im Verkauf“ (announcement/draft → presale_active) when Vorverkaufsstart is reached
 * AND canStartSales() passes (cover mandatory).
 *
 * Triggers (any one is enough — must not fail silently):
 * 1. Save — resolvePersistedEventStatus() / statusAfterPresaleStart() in create/update
 * 2. Page open — ensurePresaleAutoRelease() on admin event detail + public/embed event pages
 * 3. Public + admin listings — releaseDuePresales() on homepage, /events, embed shop, admin, Kasse
 * 4. Cron — GET /api/v1/cron/release-presale (daily on Hobby; releaseDuePresales under the hood)
 * 5. Cover upload — tryActivateSalesAfterCover() when start already due
 *
 * Reads also use effectiveEventStatus() so shop/listings treat due announcements as on sale
 * only when cover (and essentials) allow it.
 */

type ReleaseEvent = {
  id: string;
  organizationId: string;
  status: string;
  presaleStartsAt: Date | null;
  coverImageUrl?: string | null;
  eventStartsAt?: Date | null;
  tour?: { coverImageUrl?: string | null; visibility?: string | null } | null;
  categories?: CanStartSalesInput["categories"];
};

export async function ensurePresaleAutoRelease(
  event: ReleaseEvent,
  opts?: { trigger?: "cron" | "presale_due" | "cover_upload" | "save" },
): Promise<{ status: string; flipped: boolean; blocked: boolean }> {
  if (
    !(PRESALE_AUTO_RELEASE_STATUSES as readonly string[]).includes(event.status) ||
    !event.presaleStartsAt ||
    event.presaleStartsAt.getTime() > Date.now()
  ) {
    return { status: event.status, flipped: false, blocked: false };
  }

  const ready = canStartSales({
    coverImageUrl: event.coverImageUrl,
    eventStartsAt: event.eventStartsAt,
    tour: event.tour,
    categories: event.categories,
    skipCategoryChecks: event.categories == null,
  });

  if (!ready.ok) {
    logSalesActivationBlocked({
      eventId: event.id,
      reasons: ready.reasons,
      presaleStartsAt: event.presaleStartsAt,
    });
    return { status: event.status, flipped: false, blocked: true };
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
  logSalesActivated({
    eventId: event.id,
    fromStatus: beforeStatus,
    trigger: opts?.trigger ?? "presale_due",
  });
  return { status: "presale_active", flipped: true, blocked: false };
}

/**
 * After a successful cover upload: if Vorverkaufsstart is already past and the only
 * blocker was cover, flip to Im Verkauf (idempotent).
 */
export async function tryActivateSalesAfterCover(eventId: string): Promise<{
  flipped: boolean;
  status: string;
}> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      presaleStartsAt: true,
      coverImageUrl: true,
      eventStartsAt: true,
      tour: { select: { coverImageUrl: true, visibility: true } },
      ticketCategories: {
        select: { priceGrossCents: true, capacity: true },
      },
    },
  });
  if (!event) return { flipped: false, status: "missing" };

  const result = await ensurePresaleAutoRelease(
    {
      id: event.id,
      organizationId: event.organizationId,
      status: event.status,
      presaleStartsAt: event.presaleStartsAt,
      coverImageUrl: event.coverImageUrl,
      eventStartsAt: event.eventStartsAt,
      tour: event.tour,
      categories: event.ticketCategories,
    },
    { trigger: "cover_upload" },
  );
  return { flipped: result.flipped, status: result.status };
}

/**
 * Batch-flip all due announcement/draft events (optionally scoped to one org).
 * Used by cron, public listings, admin event list, and Tageskasse so DB status cannot lag.
 * Skips events that fail canStartSales (logs EVENT_SALES_ACTIVATION_BLOCKED).
 */
export async function releaseDuePresales(opts?: {
  organizationId?: string;
  take?: number;
}): Promise<{ checked: number; flipped: number; blocked: number; at: string }> {
  const now = new Date();
  const take = opts?.take ?? 200;
  const due = await prisma.event.findMany({
    where: {
      status: { in: [...PRESALE_AUTO_RELEASE_STATUSES] },
      presaleStartsAt: { lte: now },
      ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      status: true,
      presaleStartsAt: true,
      coverImageUrl: true,
      eventStartsAt: true,
      tour: { select: { coverImageUrl: true, visibility: true } },
      ticketCategories: { select: { priceGrossCents: true, capacity: true } },
    },
    take,
  });

  let flipped = 0;
  let blocked = 0;
  for (const ev of due) {
    const result = await ensurePresaleAutoRelease(
      {
        id: ev.id,
        organizationId: ev.organizationId,
        status: ev.status,
        presaleStartsAt: ev.presaleStartsAt,
        coverImageUrl: ev.coverImageUrl,
        eventStartsAt: ev.eventStartsAt,
        tour: ev.tour,
        categories: ev.ticketCategories,
      },
      { trigger: "cron" },
    );
    if (result.flipped) flipped += 1;
    if (result.blocked) blocked += 1;
  }

  return { checked: due.length, flipped, blocked, at: now.toISOString() };
}
