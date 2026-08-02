import { prisma } from "@/lib/db";

export async function getUserPermissionKeys(userId: string, organizationId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } },
            },
          },
        },
      },
    },
  });

  if (!membership || membership.status !== "active") {
    return new Set<string>();
  }

  const keys = new Set<string>();
  for (const membershipRole of membership.roles) {
    for (const rolePermission of membershipRole.role.permissions) {
      keys.add(rolePermission.permission.key);
    }
  }
  return keys;
}

export async function userHasPermission(
  userId: string,
  organizationId: string,
  permission: string,
) {
  const keys = await getUserPermissionKeys(userId, organizationId);
  return keys.has(permission);
}

export async function assertPermission(
  userId: string,
  organizationId: string,
  permission: string,
) {
  const allowed = await userHasPermission(userId, organizationId, permission);
  if (!allowed) {
    throw new Error(`FORBIDDEN:${permission}`);
  }
}

export async function getDefaultOrganizationForUser(userId: string) {
  return prisma.membership.findFirst({
    where: { userId, status: "active" },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
}
