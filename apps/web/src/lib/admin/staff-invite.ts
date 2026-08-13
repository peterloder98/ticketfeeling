import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import {
  ensureStaffManageableRoles,
  staffRoleLabel,
  type StaffManageableRoleKey,
} from "@/lib/admin/staff-access";
import { hashPassword } from "@/lib/security/password";
import { formatDeDateTime } from "@/lib/datetime-de";

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl() {
  return getPublicAppUrl();
}

const INVITABLE_ROLE_KEYS = new Set<StaffManageableRoleKey>(["organizer_admin", "scanner"]);

/** "Offene Einladungen" — only pending and not past expiry. */
export function isOpenStaffInvite(status: string, expiresAt: Date, now = new Date()) {
  return status === "pending" && expiresAt.getTime() > now.getTime();
}

/** Staff invites shown under Benutzerverwaltung → Offene Einladungen. */
export async function listOpenStaffInvites(organizationId: string, take = 50) {
  const now = new Date();
  return prisma.staffInvite.findMany({
    where: {
      organizationId,
      status: "pending",
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      roleKey: true,
      status: true,
      invitedAt: true,
      expiresAt: true,
      token: true,
    },
    orderBy: { invitedAt: "desc" },
    take,
  });
}

export async function createStaffInvite(input: {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  roleKey: StaffManageableRoleKey;
  expiresInDays?: number;
}) {
  if (!INVITABLE_ROLE_KEYS.has(input.roleKey)) {
    throw new Error("ROLE_NOT_INVITABLE");
  }

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

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (input.expiresInDays ?? 14));

  const invite = await prisma.staffInvite.create({
    data: {
      organizationId: input.organizationId,
      email,
      emailNormalized: email,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      roleKey: input.roleKey,
      token,
      tokenHash: hashInviteToken(token),
      status: "pending",
      invitedByUserId: input.invitedByUserId,
      expiresAt,
    },
  });

  const link = `${appUrl()}/einladung/${token}`;
  const roleName = staffRoleLabel(input.roleKey);
  const greeting = `Guten Tag ${invite.firstName} ${invite.lastName},`;
  const purpose =
    input.roleKey === "scanner"
      ? "Sie wurden eingeladen, als Scannerpersonal Tickets am Einlass zu prüfen."
      : "Sie wurden als Administrator für Ticketfeeling eingeladen.";
  const afterLogin =
    input.roleKey === "scanner"
      ? "Nach dem Login wählen Sie zuerst das Event und starten dann den Scanner."
      : "Nach dem Login gelangen Sie in die Verwaltung.";

  const text = [
    greeting,
    "",
    purpose,
    afterLogin,
    "",
    "Bitte richten Sie Ihren Zugang über diesen Link ein (Passwort vergeben):",
    link,
    "",
    `Rolle: ${roleName}`,
    `Der Link ist gültig bis ${formatDeDateTime(expiresAt)}.`,
    "",
    "Mit freundlichen Grüßen",
    "Ticketfeeling",
  ].join("\n");

  await enqueueTransactionalEmail({
    organizationId: input.organizationId,
    to: email,
    template: "staff_invite",
    subject:
      input.roleKey === "scanner"
        ? "Einladung zum Einlass-Scanner – Ticketfeeling"
        : "Einladung als Administrator – Ticketfeeling",
    payload: {
      firstName: invite.firstName,
      lastName: invite.lastName,
      roleKey: input.roleKey,
      roleName,
      link,
      expiresAt: expiresAt.toISOString(),
    },
    text,
    html: text.replaceAll("\n", "<br/>"),
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.invitedByUserId,
    action: "staff.invite.sent",
    entityType: "staff_invite",
    entityId: invite.id,
    after: { email, roleKey: input.roleKey, expiresAt: expiresAt.toISOString() },
  });

  return invite;
}

export async function acceptStaffInvite(input: { token: string; password: string }) {
  if (input.password.length < 8) throw new Error("PASSWORD_TOO_SHORT");

  const tokenHash = hashInviteToken(input.token);
  const invite = await prisma.staffInvite.findFirst({
    where: {
      OR: [{ token: input.token }, { tokenHash }],
      status: "pending",
    },
  });
  if (!invite) throw new Error("INVITE_NOT_FOUND");
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.staffInvite.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    throw new Error("INVITE_EXPIRED");
  }

  await ensureStaffManageableRoles(invite.organizationId);

  const passwordHash = await hashPassword(input.password);
  const name = `${invite.firstName} ${invite.lastName}`.trim();

  const result = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: invite.emailNormalized } });
    if (user) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          name,
          status: "active",
          emailVerified: new Date(),
        },
      });
    } else {
      user = await tx.user.create({
        data: {
          email: invite.emailNormalized,
          name,
          passwordHash,
          status: "active",
          emailVerified: new Date(),
        },
      });
    }

    let membership = await tx.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId: user.id,
        },
      },
    });
    if (!membership) {
      membership = await tx.membership.create({
        data: {
          organizationId: invite.organizationId,
          userId: user.id,
          status: "active",
        },
      });
    } else if (membership.status !== "active") {
      membership = await tx.membership.update({
        where: { id: membership.id },
        data: { status: "active" },
      });
    }

    const role = await tx.role.findFirst({
      where: { key: invite.roleKey, organizationId: invite.organizationId },
    });
    if (!role) throw new Error("ROLE_MISSING");

    // Replace staff roles with the invited one (single primary staff role).
    await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await tx.membershipRole.create({
      data: { membershipId: membership.id, roleId: role.id },
    });

    await tx.staffInvite.update({
      where: { id: invite.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedUserId: user.id,
        token: `accepted:${invite.id}`,
      },
    });

    return { user, roleKey: invite.roleKey };
  });

  await writeAudit({
    organizationId: invite.organizationId,
    actorUserId: result.user.id,
    action: "staff.invite.accepted",
    entityType: "staff_invite",
    entityId: invite.id,
    after: { userId: result.user.id, roleKey: result.roleKey },
  });

  return result;
}

export async function getPendingStaffInviteByToken(token: string) {
  const tokenHash = hashInviteToken(token);
  return prisma.staffInvite.findFirst({
    where: {
      OR: [{ token }, { tokenHash }],
      status: "pending",
    },
    include: {
      organization: { select: { name: true } },
    },
  });
}

export function homePathForStaffRole(roleKey: string) {
  if (roleKey === "scanner") return "/scanner";
  if (roleKey === "box_office") return "/kasse";
  return "/admin";
}
