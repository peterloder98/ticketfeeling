import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

/**
 * Persist announcement → presale_active when Vorverkaufsstart has passed.
 * Safe to call on page load; no-op when not due. Complements effectiveEventStatus().
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
