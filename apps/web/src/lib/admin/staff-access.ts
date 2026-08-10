import { prisma } from "@/lib/db";
import { userHasPermission } from "@/lib/rbac";
import {
  ensureVorverkaufRole,
  isBoxOfficeOnlyUser,
  VORVERKAUF_ROLE_PERMISSIONS,
} from "@/lib/commerce/box-office-access";

/** Roles assignable in Benutzerverwaltung. */
export const STAFF_MANAGEABLE_ROLES = [
  {
    key: "organizer_admin",
    name: "Administrator",
    description: "Voller Admin-Zugriff inkl. Scanner und Tageskasse",
  },
  {
    key: "box_office",
    name: "Vorverkaufsstelle",
    description: "Nur Tageskasse (/kasse) für freigegebene Events",
  },
  {
    key: "scanner",
    name: "Scanner",
    description: "Nur Einlass-Scanner — zuerst Event wählen",
  },
] as const;

export type StaffManageableRoleKey = (typeof STAFF_MANAGEABLE_ROLES)[number]["key"];

export const SCANNER_ROLE_PERMISSIONS = ["events:read", "checkin:scan"] as const;

const ORGANIZER_ADMIN_PERMISSION_HINTS = [
  "org:read",
  "org:write",
  "users:read",
  "users:write",
  "roles:read",
  "roles:write",
  "events:read",
  "events:write",
  "events:publish",
  "artists:read",
  "artists:write",
  "locations:read",
  "locations:write",
  "tours:read",
  "tours:write",
  "legal:read",
  "legal:write",
  "bank:read",
  "bank:write",
  "audit:read",
  "support:inbox",
  "support:knowledge:write",
  "reports:read",
  "checkin:scan",
  "checkin:manual_override",
  "box_office:sell",
  "box_office:close",
] as const;

/** Skip full role DDL when this process already synced the org recently. */
const staffRoleSyncAt = new Map<string, number>();
const STAFF_ROLE_SYNC_TTL_MS = 10 * 60 * 1000;

/**
 * Reiner Scanner: checkin:scan, kein Admin und keine Tageskasse.
 * Admins (org:read / write / users:write) sind bewusst ausgenommen —
 * sie behalten vollen Zugriff inkl. Scanner.
 */
export async function isScannerOnlyUser(userId: string, organizationId: string) {
  const canScan = await userHasPermission(userId, organizationId, "checkin:scan");
  if (!canScan) return false;
  if (await isBoxOfficeOnlyUser(userId, organizationId)) return false;

  const elevated =
    (await userHasPermission(userId, organizationId, "events:write")) ||
    (await userHasPermission(userId, organizationId, "org:write")) ||
    (await userHasPermission(userId, organizationId, "users:write")) ||
    (await userHasPermission(userId, organizationId, "org:read"));
  return !elevated;
}

async function staffRolesLookComplete(organizationId: string) {
  const roles = await prisma.role.findMany({
    where: {
      organizationId,
      key: { in: ["organizer_admin", "scanner", "box_office"] },
    },
    select: {
      key: true,
      permissions: { select: { permission: { select: { key: true } } } },
    },
  });
  if (roles.length < 3) return false;

  const byKey = new Map(
    roles.map((role) => [
      role.key,
      new Set(role.permissions.map((row) => row.permission.key)),
    ]),
  );

  const adminKeys = byKey.get("organizer_admin");
  if (!adminKeys || !ORGANIZER_ADMIN_PERMISSION_HINTS.every((key) => adminKeys.has(key))) {
    return false;
  }

  const scannerKeys = byKey.get("scanner");
  if (!scannerKeys || !SCANNER_ROLE_PERMISSIONS.every((key) => scannerKeys.has(key))) {
    return false;
  }

  const boxKeys = byKey.get("box_office");
  if (!boxKeys || !VORVERKAUF_ROLE_PERMISSIONS.every((key) => boxKeys.has(key))) {
    return false;
  }
  // Legacy Vorverkauf roles sometimes carried org/events grants — force a sync to strip.
  for (const key of boxKeys) {
    if (!(VORVERKAUF_ROLE_PERMISSIONS as readonly string[]).includes(key)) return false;
  }

  return true;
}

/** Ensure Scanner + Admin roles exist (Vorverkauf via ensureVorverkaufRole). */
export async function ensureStaffManageableRoles(organizationId: string) {
  const last = staffRoleSyncAt.get(organizationId);
  if (last && Date.now() - last < STAFF_ROLE_SYNC_TTL_MS) return;

  if (await staffRolesLookComplete(organizationId)) {
    staffRoleSyncAt.set(organizationId, Date.now());
    return;
  }

  // Parallel role sync — previously sequential and ~60 roundtrips on every page load.
  await Promise.all([
    ensureVorverkaufRole(organizationId),
    ensureScannerRole(organizationId),
    ensureOrganizerAdminRole(organizationId),
  ]);
  staffRoleSyncAt.set(organizationId, Date.now());
}

export async function ensureScannerRole(organizationId: string) {
  await Promise.all(
    SCANNER_ROLE_PERMISSIONS.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: {},
        create: {
          key,
          description: key === "checkin:scan" ? "Tickets am Einlass scannen" : "Events lesen",
        },
      }),
    ),
  );

  const role = await prisma.role.upsert({
    where: {
      organizationId_key: { organizationId, key: "scanner" },
    },
    update: { name: "Scannerpersonal", isSystem: true },
    create: {
      organizationId,
      key: "scanner",
      name: "Scannerpersonal",
      isSystem: true,
    },
  });

  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...SCANNER_ROLE_PERMISSIONS] } },
  });
  const allowedIds = new Set(permissions.map((p) => p.id));

  await Promise.all(
    permissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      }),
    ),
  );

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

export async function ensureOrganizerAdminRole(organizationId: string) {
  await Promise.all(
    ORGANIZER_ADMIN_PERMISSION_HINTS.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: key },
      }),
    ),
  );

  const role = await prisma.role.upsert({
    where: {
      organizationId_key: { organizationId, key: "organizer_admin" },
    },
    update: { name: "Veranstalteradministrator", isSystem: true },
    create: {
      organizationId,
      key: "organizer_admin",
      name: "Veranstalteradministrator",
      isSystem: true,
    },
  });

  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...ORGANIZER_ADMIN_PERMISSION_HINTS] } },
  });

  await Promise.all(
    permissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      }),
    ),
  );

  return role;
}

export async function getOrgRoleByKey(organizationId: string, key: string) {
  return prisma.role.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
}

export function staffRoleLabel(key: string) {
  const found = STAFF_MANAGEABLE_ROLES.find((r) => r.key === key);
  if (found) return found.name;
  if (key === "organizer_admin") return "Administrator";
  if (key === "box_office") return "Vorverkaufsstelle";
  if (key === "scanner") return "Scanner";
  return key;
}

/** Admins may manage staff via users:write or broad org:write. */
export async function canManageStaffUsers(userId: string, organizationId: string) {
  return (
    (await userHasPermission(userId, organizationId, "users:write")) ||
    (await userHasPermission(userId, organizationId, "org:write"))
  );
}

export { VORVERKAUF_ROLE_PERMISSIONS };
