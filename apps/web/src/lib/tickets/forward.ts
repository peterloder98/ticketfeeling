import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import { buildTicketForwardedMail } from "@/lib/email/ticket-mail";
import {
  isTicketHolder,
  isTicketParty,
  isTicketTransferred,
} from "@/lib/tickets/access";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatDeDateTime } from "@/lib/datetime-de";

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

/**
 * Reassign ticket holder and e-mail the ticket PDF to the recipient.
 * Order buyer remains the purchaser; only the ticket holder changes.
 *
 * After the first forward (holder ≠ buyer), the buyer may only resend to the
 * already saved recipient — not reassign to someone else. Current holders and
 * staff may still transfer further.
 */
export async function forwardTicket(input: {
  ticketId: string;
  actorUserId: string;
  /** Session e-mail as fallback if User row is missing/outdated */
  actorEmail?: string | null;
  firstName: string;
  lastName: string;
  email: string;
}) {
  let firstName = input.firstName.trim();
  let lastName = input.lastName.trim();
  let email = normalizeEmail(input.email);
  if (!firstName || !lastName) throw new Error("NAME_REQUIRED");
  if (!email || !email.includes("@")) throw new Error("EMAIL_INVALID");

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    include: {
      holder: true,
      order: { include: { customer: true } },
      organization: true,
      event: { include: { location: true } },
    },
  });
  if (!ticket) throw new Error("TICKET_NOT_FOUND");
  if (ticket.status !== "active") throw new Error("TICKET_NOT_ACTIVE");

  const actor = await prisma.user.findUnique({ where: { id: input.actorUserId } });
  const actorEmail =
    normalizeEmail(input.actorEmail ?? "") ||
    normalizeEmail(actor?.email ?? "") ||
    null;

  const isParty = isTicketParty({
    sessionUserId: input.actorUserId,
    sessionEmail: actorEmail,
    holder: ticket.holder,
    orderCustomer: ticket.order.customer,
  });

  let isStaff = false;
  if (!isParty) {
    const membership = await getDefaultOrganizationForUser(input.actorUserId);
    if (membership?.organizationId === ticket.organizationId) {
      isStaff =
        (await userHasPermission(input.actorUserId, membership.organizationId, "events:read")) ||
        (await userHasPermission(input.actorUserId, membership.organizationId, "org:read")) ||
        (await userHasPermission(input.actorUserId, membership.organizationId, "box_office:sell"));
    }
  }

  if (!isParty && !isStaff) throw new Error("FORBIDDEN");

  const transferred = isTicketTransferred({
    holderCustomerId: ticket.holderCustomerId,
    orderCustomerId: ticket.order.customerId,
  });
  const actorIsHolder = isTicketHolder({
    sessionUserId: input.actorUserId,
    sessionEmail: actorEmail,
    holder: ticket.holder,
  });

  // Buyer (not current holder): resend only to the saved recipient.
  if (transferred && ticket.holder && !actorIsHolder && !isStaff) {
    const lockedEmail = normalizeEmail(ticket.holder.emailNormalized || ticket.holder.email);
    if (email !== lockedEmail) {
      throw new Error("FORWARD_RECIPIENT_LOCKED");
    }
    firstName = ticket.holder.firstName.trim() || firstName;
    lastName = ticket.holder.lastName.trim() || lastName;
    email = lockedEmail;
  }

  // Rate-limit: max 5 forwards per ticket / 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.ticketResendEvent.count({
    where: {
      ticketId: ticket.id,
      channel: "forward",
      createdAt: { gte: since },
    },
  });
  if (recent >= 5) throw new Error("FORWARD_LIMIT");

  const existingUser = await prisma.user.findUnique({ where: { email } });
  const recipient = await prisma.customer.upsert({
    where: {
      organizationId_emailNormalized: {
        organizationId: ticket.organizationId,
        emailNormalized: email,
      },
    },
    update: {
      firstName,
      lastName,
      email,
      userId: existingUser?.id ?? undefined,
    },
    create: {
      organizationId: ticket.organizationId,
      email,
      emailNormalized: email,
      firstName,
      lastName,
      userId: existingUser?.id ?? null,
    },
  });

  const previousHolderId = ticket.holderCustomerId;
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { holderCustomerId: recipient.id },
  });

  await prisma.ticketResendEvent.create({
    data: {
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      orderId: ticket.orderId,
      actorUserId: input.actorUserId,
      channel: "forward",
    },
  });

  const whenLabel = ticket.event.eventStartsAt
    ? formatDeDateTime(ticket.event.eventStartsAt, {
        dateStyle: "full",
        timeStyle: "short",
      })
    : "Termin folgt";
  const locationLabel = ticket.event.location
    ? [ticket.event.location.name, ticket.event.location.city].filter(Boolean).join(", ")
    : null;
  const senderName =
    `${ticket.order.customer.firstName} ${ticket.order.customer.lastName}`.trim() ||
    ticket.order.customer.email;

  const mail = buildTicketForwardedMail({
    recipientFirstName: firstName,
    senderName,
    eventName: ticket.eventNameSnapshot || ticket.event.name,
    whenLabel,
    locationLabel,
    ticketNumber: ticket.ticketNumber,
    seatLabel: ticket.seatLabel,
    categoryLabel: ticket.categorySnapshot,
    ticketId: ticket.id,
    orderId: ticket.orderId,
    hasAttachment: true,
  });

  await enqueueTransactionalEmail({
    organizationId: ticket.organizationId,
    to: email,
    template: "ticket_forwarded",
    subject: mail.subject,
    payload: {
      ticketNumber: ticket.ticketNumber,
      recipient: email,
      senderName,
    },
    attachTicketPdfs: true,
    ticketIds: [ticket.id],
    text: mail.text,
    html: mail.html,
    compactPdf: true,
    embedLogo: true,
  });

  await writeAudit({
    organizationId: ticket.organizationId,
    actorUserId: input.actorUserId,
    action: "ticket.forwarded",
    entityType: "ticket",
    entityId: ticket.id,
    before: { holderCustomerId: previousHolderId },
    after: {
      holderCustomerId: recipient.id,
      email,
      firstName,
      lastName,
    },
  });

  return {
    ok: true as const,
    holder: { firstName, lastName, email },
  };
}
