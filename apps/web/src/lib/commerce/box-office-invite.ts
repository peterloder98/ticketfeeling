import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import { ensureVorverkaufRole } from "@/lib/commerce/box-office-access";
import { hashPassword } from "@/lib/security/password";

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl() {
  return getPublicAppUrl();
}

export async function createBoxOfficeInvite(input: {
  organizationId: string;
  invitedByUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  eventIds: string[];
  expiresInDays?: number;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("INVALID_EMAIL");
  if (!input.firstName.trim() || !input.lastName.trim()) throw new Error("NAME_REQUIRED");
  if (input.eventIds.length < 1) throw new Error("EVENT_REQUIRED");

  const events = await prisma.event.findMany({
    where: { id: { in: input.eventIds }, organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  if (events.length !== input.eventIds.length) throw new Error("EVENT_NOT_FOUND");

  // Sync Rolle „Vorverkaufsstelle“ (Tageskasse-only) before invite.
  await ensureVorverkaufRole(input.organizationId);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (input.expiresInDays ?? 14));

  const invite = await prisma.boxOfficeInvite.create({
    data: {
      organizationId: input.organizationId,
      email,
      emailNormalized: email,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      token,
      tokenHash: hashInviteToken(token),
      status: "pending",
      invitedByUserId: input.invitedByUserId,
      expiresAt,
      events: {
        create: events.map((e) => ({ eventId: e.id })),
      },
    },
    include: { events: { include: { event: { select: { name: true } } } } },
  });

  const link = `${appUrl()}/einladung/${token}`;
  const eventNames = invite.events.map((e) => e.event.name).join(", ");
  const greeting = `Guten Tag ${invite.firstName} ${invite.lastName},`;
  const text = [
    greeting,
    "",
    "Sie wurden eingeladen, für Ticketfeeling Vorverkauf / Tageskasse zu verkaufen.",
    `Freigegebene Events: ${eventNames}`,
    "",
    "Bitte richten Sie Ihren Zugang über diesen Link ein (Passwort vergeben):",
    link,
    "",
    `Der Link ist gültig bis ${expiresAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}.`,
    "",
    "Mit freundlichen Grüßen",
    "Ticketfeeling",
  ].join("\n");

  await enqueueTransactionalEmail({
    organizationId: input.organizationId,
    to: email,
    template: "box_office_invite",
    subject: "Einladung zur Tageskasse / Vorverkauf – Ticketfeeling",
    payload: {
      firstName: invite.firstName,
      lastName: invite.lastName,
      events: eventNames,
      link,
      expiresAt: expiresAt.toISOString(),
    },
    text,
    html: text.replaceAll("\n", "<br/>"),
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.invitedByUserId,
    action: "box_office.invite.sent",
    entityType: "box_office_invite",
    entityId: invite.id,
    after: { email, eventIds: input.eventIds, expiresAt: expiresAt.toISOString() },
  });

  return invite;
}

export async function acceptBoxOfficeInvite(input: {
  token: string;
  password: string;
}) {
  if (input.password.length < 8) throw new Error("PASSWORD_TOO_SHORT");

  const tokenHash = hashInviteToken(input.token);
  const invite = await prisma.boxOfficeInvite.findFirst({
    where: {
      OR: [{ token: input.token }, { tokenHash }],
      status: "pending",
    },
    include: { events: true, organization: true },
  });
  if (!invite) throw new Error("INVITE_NOT_FOUND");
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.boxOfficeInvite.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    throw new Error("INVITE_EXPIRED");
  }

  const passwordHash = await hashPassword(input.password);
  const name = `${invite.firstName} ${invite.lastName}`.trim();

  await ensureVorverkaufRole(invite.organizationId);

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

    // Role ensured outside tx below if missing; prefer org-scoped Vorverkaufsstelle.
    let role = await tx.role.findFirst({
      where: { key: "box_office", organizationId: invite.organizationId },
    });
    if (!role) {
      role = await tx.role.findFirst({
        where: { key: "box_office", organizationId: null },
      });
    }
    if (!role) throw new Error("ROLE_MISSING");

    await tx.membershipRole.upsert({
      where: {
        membershipId_roleId: { membershipId: membership.id, roleId: role.id },
      },
      update: {},
      create: { membershipId: membership.id, roleId: role.id },
    });

    for (const ev of invite.events) {
      await tx.boxOfficeSellerGrant.upsert({
        where: {
          userId_eventId: { userId: user.id, eventId: ev.eventId },
        },
        update: {},
        create: {
          organizationId: invite.organizationId,
          userId: user.id,
          eventId: ev.eventId,
        },
      });
    }

    await tx.boxOfficeInvite.update({
      where: { id: invite.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedUserId: user.id,
        token: `accepted:${invite.id}`,
      },
    });

    return user;
  });

  await writeAudit({
    organizationId: invite.organizationId,
    actorUserId: result.id,
    action: "box_office.invite.accepted",
    entityType: "box_office_invite",
    entityId: invite.id,
    after: { userId: result.id },
  });

  return result;
}

export async function getPendingInviteByToken(token: string) {
  const tokenHash = hashInviteToken(token);
  return prisma.boxOfficeInvite.findFirst({
    where: {
      OR: [{ token }, { tokenHash }],
      status: "pending",
    },
    include: {
      events: { include: { event: { select: { id: true, name: true, eventStartsAt: true } } } },
      organization: { select: { name: true } },
    },
  });
}
