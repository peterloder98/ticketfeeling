import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import { buildBoxOfficeTicketsMail } from "@/lib/email/ticket-mail";

export async function markBoxOfficePrinted(input: {
  orderId: string;
  organizationId: string;
  actorUserId: string;
}) {
  const order = await prisma.order.findFirst({
    where: {
      id: input.orderId,
      organizationId: input.organizationId,
      channel: "box_office",
      voidedAt: null,
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const next =
    order.deliveryStatus === "emailed" || order.deliveryStatus === "both"
      ? "both"
      : "printed";

  await prisma.order.update({
    where: { id: order.id },
    data: {
      deliveryStatus: next,
      deliveryPrintedAt: order.deliveryPrintedAt ?? new Date(),
    },
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "box_office.delivery.printed",
    entityType: "order",
    entityId: order.id,
  });

  return { deliveryStatus: next };
}

export async function emailBoxOfficeTickets(input: {
  orderId: string;
  organizationId: string;
  actorUserId: string;
  toEmail?: string;
}) {
  const order = await prisma.order.findFirst({
    where: {
      id: input.orderId,
      organizationId: input.organizationId,
      channel: "box_office",
      voidedAt: null,
    },
    include: {
      customer: true,
      tickets: true,
      items: true,
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const to =
    input.toEmail?.trim().toLowerCase() ||
    (order.customer.email.includes("@ticketfeeling.local")
      ? null
      : order.customer.email.toLowerCase());
  if (!to) throw new Error("EMAIL_REQUIRED");

  const eventName = order.items[0]?.eventNameSnapshot ?? "Event";
  const startsAt = order.items[0]?.eventStartsAtSnapshot;
  const whenLabel = startsAt
    ? startsAt.toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        dateStyle: "full",
        timeStyle: "short",
      })
    : "dem angekündigten Termin";

  const mail = buildBoxOfficeTicketsMail({
    firstName: order.customer.firstName,
    lastName: order.customer.lastName,
    eventName,
    whenLabel,
    ticketCount: order.tickets.length,
  });

  await enqueueTransactionalEmail({
    organizationId: input.organizationId,
    to,
    template: "box_office_tickets",
    subject: mail.subject,
    payload: {
      orderNumber: order.orderNumber,
      eventName,
      when: whenLabel,
      ticketCount: order.tickets.length,
    },
    ticketIds: order.tickets.map((t) => t.id),
    text: mail.text,
    html: mail.html,
    compactPdf: true,
  });

  const next =
    order.deliveryStatus === "printed" || order.deliveryStatus === "both" ? "both" : "emailed";

  await prisma.order.update({
    where: { id: order.id },
    data: {
      deliveryStatus: next,
      deliveryEmailedAt: order.deliveryEmailedAt ?? new Date(),
    },
  });

  if (order.customer.email.includes("@ticketfeeling.local")) {
    await prisma.customer.update({
      where: { id: order.customer.id },
      data: { email: to, emailNormalized: to },
    });
  }

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "box_office.delivery.emailed",
    entityType: "order",
    entityId: order.id,
    after: { to, attachments: order.tickets.length },
  });

  return { deliveryStatus: next, to };
}
