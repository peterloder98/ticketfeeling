import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  ensureStaffManageableRoles,
  type StaffManageableRoleKey,
} from "@/lib/admin/staff-access";

export async function listStaffMemberships(organizationId: string) {
  return prisma.membership.findMany({
    where: { organizationId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      roles: {
        include: { role: { select: { id: true, key: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createStaffUser(input: {
  organizationId: string;
  actorUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  roleKey: StaffManageableRoleKey;
  password: string;
}) {
  if (input.roleKey === "box_office") {
    throw new Error("USE_BOX_OFFICE_INVITE");
  }
  if (input.password.length < 8) throw new Error("PASSWORD_TOO_SHORT");

  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("INVALID_EMAIL");
  if (!input.firstName.trim() || !input.lastName.trim()) throw new Error("NAME_REQUIRED");

  await ensureStaffManageableRoles(input.organizationId);

  const role = await prisma.role.findUnique({
    where: {
      organizationId_key: { organizationId: input.organizationId, key: input.roleKey },
    },
  });
  if (!role) throw new Error("ROLE_MISSING");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: { organizationId: input.organizationId, userId: existing.id },
      },
    });
    if (membership) throw new Error("USER_ALREADY_MEMBER");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const name = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();

  const user = await prisma.$transaction(async (tx) => {
    let u = existing;
    if (u) {
      u = await tx.user.update({
        where: { id: u.id },
        data: {
          passwordHash,
          name,
          status: "active",
          emailVerified: new Date(),
        },
      });
    } else {
      u = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          status: "active",
          emailVerified: new Date(),
        },
      });
    }

    const membership = await tx.membership.create({
      data: {
        organizationId: input.organizationId,
        userId: u.id,
        status: "active",
        roles: { create: { roleId: role.id } },
      },
    });

    return { user: u, membershipId: membership.id };
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "staff.user.created",
    entityType: "user",
    entityId: user.user.id,
    after: { email, roleKey: input.roleKey },
  });

  return user;
}

export async function setMembershipRoles(input: {
  organizationId: string;
  actorUserId: string;
  userId: string;
  roleKeys: StaffManageableRoleKey[];
}) {
  if (input.roleKeys.length < 1) throw new Error("ROLE_REQUIRED");
  if (input.roleKeys.includes("box_office") && input.roleKeys.length > 1) {
    throw new Error("BOX_OFFICE_EXCLUSIVE");
  }

  await ensureStaffManageableRoles(input.organizationId);

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
  });
  if (!membership) throw new Error("MEMBERSHIP_NOT_FOUND");

  const roles = await prisma.role.findMany({
    where: {
      organizationId: input.organizationId,
      key: { in: input.roleKeys },
    },
  });
  if (roles.length !== input.roleKeys.length) throw new Error("ROLE_MISSING");

  await prisma.$transaction(async (tx) => {
    await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await tx.membershipRole.createMany({
      data: roles.map((r) => ({ membershipId: membership.id, roleId: r.id })),
    });
    await tx.membership.update({
      where: { id: membership.id },
      data: { status: "active" },
    });
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "staff.user.roles_updated",
    entityType: "user",
    entityId: input.userId,
    after: { roleKeys: input.roleKeys },
  });
}

export async function setMembershipStatus(input: {
  organizationId: string;
  actorUserId: string;
  userId: string;
  status: "active" | "disabled";
}) {
  if (input.userId === input.actorUserId && input.status === "disabled") {
    throw new Error("CANNOT_DISABLE_SELF");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
  });
  if (!membership) throw new Error("MEMBERSHIP_NOT_FOUND");

  await prisma.membership.update({
    where: { id: membership.id },
    data: { status: input.status },
  });

  if (input.status === "disabled") {
    await prisma.user.update({
      where: { id: input.userId },
      data: { status: "disabled" },
    });
  } else {
    await prisma.user.update({
      where: { id: input.userId },
      data: { status: "active" },
    });
  }

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "staff.user.status_updated",
    entityType: "user",
    entityId: input.userId,
    after: { status: input.status },
  });
}

export async function resetStaffPassword(input: {
  organizationId: string;
  actorUserId: string;
  userId: string;
  password: string;
}) {
  if (input.password.length < 8) throw new Error("PASSWORD_TOO_SHORT");

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
  });
  if (!membership) throw new Error("MEMBERSHIP_NOT_FOUND");

  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.user.update({
    where: { id: input.userId },
    data: { passwordHash, status: "active" },
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "staff.user.password_reset",
    entityType: "user",
    entityId: input.userId,
  });
}
