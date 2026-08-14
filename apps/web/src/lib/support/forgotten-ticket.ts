import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { createSecureToken, hashToken } from "@/lib/crypto-token";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import { buildTicketsResentMail } from "@/lib/email/ticket-mail";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import { signOrderAccessToken } from "@/lib/commerce/order-access";

export const FORGOTTEN_TICKET_GENERIC_MESSAGE =
  "Falls deine Angaben zu einer bezahlten Bestellung passen, senden wir dir in Kürze einen sicheren Link. Bitte prüfe auch deinen Spam-Ordner.";

/** Gültigkeit des Ticket-Zugangslinks. Nicht one-shot — Mail-Scanner dürfen ihn nicht verbrennen. */
export const FORGOTTEN_TICKET_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function normalizeLastName(value: string) {
  return value.trim().toLocaleLowerCase("de-DE");
}

/** Bestellnummern are allocated as TF-B-… — tolerate spaces / casing from users. */
export function normalizeOrderNumber(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Email alone is never enough. Require Bestellnummer and/or Nachname
 * (both collected / emailed at purchase). When Nachname is provided it must match;
 * Bestellnummer is applied as an order filter by the caller.
 */
export function evaluateForgottenTicketMatch(input: {
  hasCustomer: boolean;
  matchedOrderCount: number;
  customerLastName: string | null | undefined;
  orderNumberHint?: string | null;
  lastNameHint?: string | null;
}): boolean {
  const orderHint = input.orderNumberHint?.trim() ?? "";
  const lastHint = input.lastNameHint?.trim() ?? "";
  if (!orderHint && !lastHint) return false;
  if (!input.hasCustomer || input.matchedOrderCount <= 0) return false;

  if (lastHint) {
    const wanted = normalizeLastName(lastHint);
    const customerLast = normalizeLastName(input.customerLastName ?? "");
    if (!customerLast || customerLast !== wanted) return false;
  }

  return true;
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
  lastName?: string;
  ip?: string;
  organizationId?: string;
}) {
  const organizationId =
    input.organizationId ?? (await findDefaultOrganizationId());
  if (!organizationId) {
    throw new Error("NO_ORGANIZATION");
  }

  const emailNormalized = normalizeEmail(input.email);
  const orderNumberHint = input.orderNumberHint?.trim()
    ? normalizeOrderNumber(input.orderNumberHint)
    : undefined;
  const lastNameHint = input.lastName?.trim() ? input.lastName.trim() : undefined;
  const ipHash = hashValue(input.ip ?? "unknown");
  const hasSecondFactor = Boolean(orderNumberHint || lastNameHint);

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
        orderNumberHint: orderNumberHint ?? null,
        lastNameHint: lastNameHint ?? null,
        ipHash,
        status: "rate_limited",
      },
    });
    await writeAudit({
      organizationId,
      action: "support.forgotten_ticket.rate_limited",
      entityType: "forgotten_ticket_request",
      entityId: emailNormalized,
      after: {
        emailHash: hashValue(emailNormalized),
        hasOrderHint: Boolean(orderNumberHint),
        hasLastName: Boolean(lastNameHint),
        ipHash,
      },
    });
    return { message: FORGOTTEN_TICKET_GENERIC_MESSAGE, rateLimited: true };
  }

  // Without a second factor we still log the attempt but never send a link.
  const customer =
    hasSecondFactor
      ? await prisma.customer.findUnique({
          where: {
            organizationId_emailNormalized: { organizationId, emailNormalized },
          },
          include: {
            orders: {
              where: {
                status: { in: ["paid", "fulfilled"] },
                ...(orderNumberHint ? { orderNumber: orderNumberHint } : {}),
              },
              take: 10,
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : null;

  const matched = evaluateForgottenTicketMatch({
    hasCustomer: Boolean(customer),
    matchedOrderCount: customer?.orders.length ?? 0,
    customerLastName: customer?.lastName,
    orderNumberHint,
    lastNameHint,
  });

  let recoveryPath: string | undefined;

  const request = await prisma.forgottenTicketRequest.create({
    data: {
      organizationId,
      emailNormalized,
      orderNumberHint: orderNumberHint ?? null,
      lastNameHint: lastNameHint ?? null,
      ipHash,
      status: matched ? "matched" : "received",
    },
  });

  if (matched && customer) {
    const token = createSecureToken(32);
    const expiresAt = new Date(Date.now() + FORGOTTEN_TICKET_TOKEN_TTL_MS);
    await prisma.accessRecoveryToken.updateMany({
      where: {
        organizationId,
        emailNormalized,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date() },
    });
    await prisma.accessRecoveryToken.create({
      data: {
        organizationId,
        emailNormalized,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
    recoveryPath = `/hilfe/ticket-vergessen/zugang?token=${encodeURIComponent(token)}`;
    const appUrl = getPublicAppUrl();

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
      trackDelivery: true,
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
      hasOrderHint: Boolean(orderNumberHint),
      hasLastName: Boolean(lastNameHint),
      matched,
      nonce: randomBytes(8).toString("hex"),
      mailQueued: matched,
    },
  });

  return { message: FORGOTTEN_TICKET_GENERIC_MESSAGE, rateLimited: false };
}

export async function resolveRecoveryToken(token: string) {
  const tokenHash = hashToken(token);
  const row = await prisma.accessRecoveryToken.findUnique({ where: { tokenHash } });
  if (!row || row.expiresAt < new Date()) {
    return null;
  }

  // usedAt = zuletzt geöffnet, Token bleibt bis expiresAt gültig (Prefetch / zweiter Klick / anderes Gerät).
  await prisma.accessRecoveryToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  await writeAudit({
    organizationId: row.organizationId,
    action: "support.forgotten_ticket.token_opened",
    entityType: "access_recovery_token",
    entityId: row.id,
    after: { emailHash: hashValue(row.emailNormalized) },
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

  const accessToken = signOrderAccessToken(ticket.orderId, 30 * 24 * 60 * 60 * 1000);
  const mail = buildTicketsResentMail({
    firstName: ticket.holder.firstName,
    eventName: ticket.eventNameSnapshot || ticket.event.name,
    ticketNumber: ticket.ticketNumber,
    orderId: ticket.orderId,
    ticketId: ticket.id,
    hasAttachment: false,
    accessToken,
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
    text: mail.text,
    html: mail.html,
    embedLogo: true,
    orderId: ticket.orderId,
    trackDelivery: true,
  });

  await writeAudit({
    organizationId: ticket.organizationId,
    actorUserId: input.actorUserId,
    action: "ticket.resent",
    entityType: "ticket",
    entityId: ticket.id,
    after: { channel: input.channel ?? "account", pdfAttached: false },
  });

  return { ok: true };
}
