import { prisma } from "@/lib/db";
import { userHasPermission } from "@/lib/rbac";

/** Full org staff can sell any event; partners only granted events. */
export async function canSellAllBoxOfficeEvents(userId: string, organizationId: string) {
  return (
    (await userHasPermission(userId, organizationId, "events:write")) ||
    (await userHasPermission(userId, organizationId, "org:write"))
  );
}

/**
 * Vorverkaufsstelle / reine Tageskasse: darf verkaufen, aber kein Admin
 * (Events, Finanzen, Einstellungen, Bestellungen, …).
 */
export async function isBoxOfficeOnlyUser(userId: string, organizationId: string) {
  const canSell = await userHasPermission(userId, organizationId, "box_office:sell");
  if (!canSell) return false;
  const elevated =
    (await userHasPermission(userId, organizationId, "events:write")) ||
    (await userHasPermission(userId, organizationId, "org:write")) ||
    (await userHasPermission(userId, organizationId, "users:write"));
  return !elevated;
}

/** Permissions for Rolle „Vorverkaufsstelle“ (key: box_office). */
export const VORVERKAUF_ROLE_PERMISSIONS = ["box_office:sell"] as const;

/**
 * Ensure org has Rolle „Vorverkaufsstelle“ with Tageskasse-only permissions.
 * Safe to call on invite / partner admin — syncs production without full seed.
 */
export async function ensureVorverkaufRole(organizationId: string) {
  for (const key of VORVERKAUF_ROLE_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { description: "Tageskasse verkaufen" },
      create: { key, description: "Tageskasse verkaufen" },
    });
  }

  const role = await prisma.role.upsert({
    where: {
      organizationId_key: { organizationId, key: "box_office" },
    },
    update: { name: "Vorverkaufsstelle", isSystem: true },
    create: {
      organizationId,
      key: "box_office",
      name: "Vorverkaufsstelle",
      isSystem: true,
    },
  });

  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...VORVERKAUF_ROLE_PERMISSIONS] } },
  });
  const allowedIds = new Set(permissions.map((p) => p.id));

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }

  // Strip broader legacy grants (org:read, events:read, checkin:scan, …).
  const existing = await prisma.rolePermission.findMany({
    where: { roleId: role.id },
    select: { permissionId: true },
  });
  const stale = existing.filter((row) => !allowedIds.has(row.permissionId));
  if (stale.length > 0) {
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { in: stale.map((s) => s.permissionId) },
      },
    });
  }

  return role;
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
