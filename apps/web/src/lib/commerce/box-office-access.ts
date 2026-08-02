import { prisma } from "@/lib/db";
import { userHasPermission } from "@/lib/rbac";

/** Full org staff can sell any event; partners only granted events. */
export async function canSellAllBoxOfficeEvents(userId: string, organizationId: string) {
  return (
    (await userHasPermission(userId, organizationId, "events:write")) ||
    (await userHasPermission(userId, organizationId, "org:write"))
  );
}

export async function getBoxOfficeSellableEventIds(
  userId: string,
  organizationId: string,
): Promise<string[] | null> {
  if (await canSellAllBoxOfficeEvents(userId, organizationId)) return null;
  const grants = await prisma.boxOfficeSellerGrant.findMany({
    where: { userId, organizationId },
    select: { eventId: true },
  });
  return grants.map((g) => g.eventId);
}

export async function assertCanSellBoxOfficeEvent(
  userId: string,
  organizationId: string,
  eventId: string,
) {
  const ids = await getBoxOfficeSellableEventIds(userId, organizationId);
  if (ids === null) return;
  if (!ids.includes(eventId)) throw new Error("EVENT_NOT_GRANTED");
}

export async function canVoidBoxOfficeOrder(input: {
  userId: string;
  organizationId: string;
  order: { soldByUserId: string | null; deliveryStatus: string; voidedAt: Date | null };
}) {
  if (input.order.voidedAt) return false;
  const isAdmin =
    (await userHasPermission(input.userId, input.organizationId, "events:write")) ||
    (await userHasPermission(input.userId, input.organizationId, "org:write"));
  if (isAdmin) return true;
  if (input.order.soldByUserId !== input.userId) return false;
  return input.order.deliveryStatus === "none";
}
