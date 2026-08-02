import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { createSecureToken, hashToken } from "@/lib/crypto-token";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import { buildTicketsResentMail } from "@/lib/email/ticket-mail";

const GENERIC_MESSAGE =
  "Falls zu dieser E-Mail-Adresse eine passende bezahlte Bestellung existiert, senden wir dir in Kürze einen sicheren Link. Bitte prüfe auch deinen Spam-Ordner.";

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function findDefaultOrganizationId() {
  const org = await prisma.organization.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
  });
  return org?.id ?? null;
}

export async function requestForgottenTicket(input: {
  email: string;
  orderNumberHint?: string;
  ip?: string;
  organizationId?: string;
}) {
  const organizationId =
    input.organizationId ?? (await findDefaultOrganizationId());
  if (!organizationId) {
    throw new Error("NO_ORGANIZATION");
  }

  const emailNormalized = normalizeEmail(input.email);
  const ipHash = hashValue(input.ip ?? "unknown");

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.forgottenTicketRequest.count({
    where: {
      organizationId,
      emailNormalized,
      createdAt: { gte: since },
    },
  });

  if (recent >= 5) {
    await prisma.forgottenTicketRequest.create({
      data: {
        organizationId,
        emailNormalized,
        orderNumberHint: input.orderNumberHint,
        ipHash,
        status: "rate_limited",
      },
    });
    return { message: GENERIC_MESSAGE, rateLimited: true };
  }

  const customer = await prisma.customer.findUnique({
    where: {
      organizationId_emailNormalized: { organizationId, emailNormalized },
    },
    include: {
      orders: {
        where: {
          status: { in: ["paid", "fulfilled"] },
          ...(input.orderNumberHint
            ? { orderNumber: input.orderNumberHint.trim() }
            : {}),
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const matched = Boolean(customer && customer.orders.length > 0);
  let recoveryPath: string | undefined;

  const request = await prisma.forgottenTicketRequest.create({
    data: {
      organizationId,
      emailNormalized,
      orderNumberHint: input.orderNumberHint,
      ipHash,
      status: matched ? "matched" : "received",
    },
  });

  if (matched && customer) {
    const token = createSecureToken(32);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await prisma.accessRecoveryToken.create({
      data: {
        organizationId,
        emailNormalized,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
    recoveryPath = `/hilfe/ticket-vergessen/zugang?token=${encodeURIComponent(token)}`;
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    await enqueueTransactionalEmail({
      organizationId,
      to: emailNormalized,
      template: "forgotten_ticket_magic_link",
      subject: "Dein sicherer Ticket-Zugang",
      payload: {
        recoveryUrl: `${appUrl}${recoveryPath}`,
        expiresAt: expiresAt.toISOString(),
        orderNumbers: customer.orders.map((o) => o.orderNumber),
      },
    });

    // Local/dev visibility only — never expose in API response (anti-enumeration).
    if (process.env.NODE_ENV === "development") {
      console.info("[forgotten-ticket-dev-link]", emailNormalized, `${appUrl}${recoveryPath}`);
    }
  }

  await writeAudit({
    organizationId,
    action: "support.forgotten_ticket.requested",
    entityType: "forgotten_ticket_request",
    entityId: request.id,
    after: {
      emailHash: hashValue(emailNormalized),
      hasOrderHint: Boolean(input.orderNumberHint),
      matched,
      nonce: randomBytes(8).toString("hex"),
      mailQueued: matched,
    },
  });

  return { message: GENERIC_MESSAGE, rateLimited: false };
}

export async function resolveRecoveryToken(token: string) {
  const tokenHash = hashToken(token);
  const row = await prisma.accessRecoveryToken.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return null;
  }

  await prisma.accessRecoveryToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  const customer = await prisma.customer.findUnique({
    where: {
      organizationId_emailNormalized: {
        organizationId: row.organizationId,
        emailNormalized: row.emailNormalized,
      },
    },
    include: {
      orders: {
        where: { status: { in: ["paid", "fulfilled"] } },
        orderBy: { createdAt: "desc" },
        include: {
          tickets: {
            include: { qrTokens: { where: { status: "active" }, take: 1 } },
          },
          invoices: true,
        },
      },
    },
  });

  return customer;
}

export async function resendTicketMail(input: {
  ticketId: string;
  actorUserId?: string;
  channel?: string;
}) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    include: { holder: true, order: true, organization: true, event: true },
  });
  if (!ticket || !ticket.holder) throw new Error("TICKET_NOT_FOUND");
  if (!["active"].includes(ticket.status)) throw new Error("TICKET_NOT_ACTIVE");

  await prisma.ticketResendEvent.create({
    data: {
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      orderId: ticket.orderId,
      actorUserId: input.actorUserId,
      channel: input.channel ?? "account",
    },
  });

  const mail = buildTicketsResentMail({
    firstName: ticket.holder.firstName,
    eventName: ticket.eventNameSnapshot || ticket.event.name,
    ticketNumber: ticket.ticketNumber,
    orderId: ticket.orderId,
    ticketId: ticket.id,
    hasAttachment: true,
  });

  await enqueueTransactionalEmail({
    organizationId: ticket.organizationId,
    to: ticket.holder.email,
    template: "tickets_resent",
    subject: mail.subject,
    payload: {
      ticketNumber: ticket.ticketNumber,
      orderNumber: ticket.order.orderNumber,
      ticketPath: `/ticket/${ticket.id}`,
    },
    ticketIds: [ticket.id],
    text: mail.text,
    html: mail.html,
    compactPdf: true,
    embedLogo: true,
  });

  await writeAudit({
    organizationId: ticket.organizationId,
    actorUserId: input.actorUserId,
    action: "ticket.resent",
    entityType: "ticket",
    entityId: ticket.id,
    after: { channel: input.channel ?? "account", pdfAttached: true },
  });

  return { ok: true };
}
