import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

/**
 * Add and/or remove BoxOfficeSellerGrant rows for an existing Vorverkaufsstelle.
 * Used when inviting later events after the partner is already active.
 */
export async function patchBoxOfficeSellerGrants(input: {
  organizationId: string;
  actorUserId: string;
  userId: string;
  addEventIds?: string[];
  removeEventIds?: string[];
}) {
  const addIds = [...new Set((input.addEventIds ?? []).filter(Boolean))];
  const removeIds = [...new Set((input.removeEventIds ?? []).filter(Boolean))];
  if (addIds.length < 1 && removeIds.length < 1) {
    throw new Error("NO_CHANGES");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    include: {
      roles: { include: { role: { select: { key: true } } } },
    },
  });
  if (!membership || membership.status !== "active") {
    throw new Error("PARTNER_NOT_FOUND");
  }
  const isBoxOffice = membership.roles.some((r) => r.role.key === "box_office");
  if (!isBoxOffice) {
    // Also allow if they already have grants (legacy / role sync lag).
    const existingGrant = await prisma.boxOfficeSellerGrant.findFirst({
      where: { organizationId: input.organizationId, userId: input.userId },
      select: { id: true },
    });
    if (!existingGrant) throw new Error("NOT_BOX_OFFICE_PARTNER");
  }

  const allEventIds = [...new Set([...addIds, ...removeIds])];
  const events = await prisma.event.findMany({
    where: { id: { in: allEventIds }, organizationId: input.organizationId },
    select: { id: true },
  });
  if (events.length !== allEventIds.length) throw new Error("EVENT_NOT_FOUND");

  const added: string[] = [];
  const removed: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const eventId of addIds) {
      const row = await tx.boxOfficeSellerGrant.upsert({
        where: { userId_eventId: { userId: input.userId, eventId } },
        update: {},
        create: {
          organizationId: input.organizationId,
          userId: input.userId,
          eventId,
        },
      });
      added.push(row.eventId);
    }
    if (removeIds.length > 0) {
      const deleted = await tx.boxOfficeSellerGrant.deleteMany({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          eventId: { in: removeIds },
        },
      });
      if (deleted.count > 0) removed.push(...removeIds);
    }
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "box_office.grants.patched",
    entityType: "user",
    entityId: input.userId,
    after: { addEventIds: addIds, removeEventIds: removeIds },
  });

  const grants = await prisma.boxOfficeSellerGrant.findMany({
    where: { organizationId: input.organizationId, userId: input.userId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          eventStartsAt: true,
          location: { select: { name: true, city: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return { added, removed, grants };
}
