import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { createBoxOfficeSale } from "@/lib/commerce/box-office";
import { voidBoxOfficeOrder } from "@/lib/commerce/box-office-void";
import { patchBoxOfficeSellerGrants } from "@/lib/commerce/box-office-grants";
import { emailBoxOfficeTickets } from "@/lib/commerce/box-office-delivery";

/**
 * Vorabbuchung / Kontingent für eine Vorverkaufsstelle.
 *
 * Issues real box-office tickets (inventory soldQuantity ++) so Online
 * cannot double-sell. Tickets start as consignmentState=assigned (pre-printed,
 * not finally sold). Partner marks sold without minting a new QR/ID.
 * Unsold assigned tickets can be voided at the end (inventory restored).
 */
export async function allocateBoxOfficeConsignment(input: {
  organizationId: string;
  actorUserId: string;
  partnerUserId: string;
  eventId: string;
  categoryId: string;
  quantity: number;
}) {
  const qty = Math.round(input.quantity);
  if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
    throw new Error("INVALID_QUANTITY");
  }

  const partner = await prisma.user.findFirst({
    where: { id: input.partnerUserId },
    select: { id: true, email: true, name: true },
  });
  if (!partner?.email) throw new Error("PARTNER_NOT_FOUND");

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: partner.id,
      },
    },
  });
  if (!membership || membership.status !== "active") {
    throw new Error("PARTNER_NOT_FOUND");
  }

  const event = await prisma.event.findFirst({
    where: { id: input.eventId, organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  if (!event) throw new Error("EVENT_NOT_FOUND");

  const category = await prisma.eventTicketCategory.findFirst({
    where: {
      id: input.categoryId,
      eventId: input.eventId,
      status: "active",
      boxOfficeBookable: true,
    },
    select: { id: true, name: true },
  });
  if (!category) throw new Error("CATEGORY_UNAVAILABLE");

  await patchBoxOfficeSellerGrants({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    userId: partner.id,
    addEventIds: [input.eventId],
  });

  const nameParts = (partner.name ?? "Vorverkaufsstelle").trim().split(/\s+/);
  const firstName = nameParts[0] || "Vorverkaufsstelle";
  const lastName = nameParts.slice(1).join(" ") || "Partner";

  const sale = await createBoxOfficeSale({
    organizationId: input.organizationId,
    eventId: input.eventId,
    items: [{ categoryId: input.categoryId, quantity: qty }],
    paymentMethod: "consignment",
    actorUserId: input.actorUserId,
    soldByUserId: partner.id,
    customerEmail: partner.email,
    customerFirstName: firstName,
    customerLastName: lastName,
    maxQuantityPerItem: 50,
    maxTotalQuantity: 50,
    contractNotice:
      "Kontingent Vorverkaufsstelle (Vorabbuchung). Tickets gedruckt vor Ort verkaufen; Rest am Ende stornieren.",
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "box_office.consignment.allocated",
    entityType: "order",
    entityId: sale.orderId,
    after: {
      partnerUserId: partner.id,
      eventId: input.eventId,
      categoryId: input.categoryId,
      quantity: qty,
    },
  });

  return sale;
}

export async function listBoxOfficeConsignments(organizationId: string) {
  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      channel: "box_office",
      paymentMethod: "consignment",
    },
    include: {
      customer: { select: { email: true, firstName: true, lastName: true } },
      soldByUser: { select: { id: true, email: true, name: true } },
      items: {
        select: {
          quantity: true,
          categorySnapshot: true,
          eventNameSnapshot: true,
          eventId: true,
          categoryId: true,
        },
      },
      tickets: {
        select: { id: true, status: true, consignmentState: true, ticketNumber: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  return orders.map((order) => {
    const activeTickets = order.tickets.filter((t) => t.status === "active");
    const voidedTickets = order.tickets.filter((t) => t.status === "voided");
    const assignedTickets = activeTickets.filter(
      (t) => t.consignmentState === "assigned" || t.consignmentState == null,
    );
    const soldTickets = activeTickets.filter((t) => t.consignmentState === "sold");
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      voidedAt: order.voidedAt?.toISOString() ?? null,
      deliveryStatus: order.deliveryStatus,
      partner: order.soldByUser
        ? {
            id: order.soldByUser.id,
            email: order.soldByUser.email,
            name: order.soldByUser.name,
          }
        : {
            id: null,
            email: order.customer.email,
            name: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
          },
      eventName: order.items[0]?.eventNameSnapshot ?? "—",
      categoryName: order.items[0]?.categorySnapshot ?? "—",
      eventId: order.items[0]?.eventId ?? null,
      allocated: order.items.reduce((s, i) => s + i.quantity, 0),
      activeCount: activeTickets.length,
      assignedCount: assignedTickets.length,
      soldCount: soldTickets.length,
      voidedCount: voidedTickets.length,
      ticketIds: activeTickets.map((t) => t.id),
      assignedTicketIds: assignedTickets.map((t) => t.id),
      status:
        order.voidedAt || order.status === "cancelled"
          ? ("cancelled" as const)
          : activeTickets.length === 0
            ? ("settled" as const)
            : assignedTickets.length === 0
              ? ("sold_out" as const)
              : ("open" as const),
    };
  });
}

/**
 * Mark pre-printed consignment tickets as finally sold — same QR/ticket ID,
 * no new entitlement. Optional customer email sends existing ticket mail.
 */
export async function markConsignmentTicketsSold(input: {
  organizationId: string;
  actorUserId: string;
  orderId: string;
  ticketIds?: string[];
  toEmail?: string;
}) {
  const order = await prisma.order.findFirst({
    where: {
      id: input.orderId,
      organizationId: input.organizationId,
      channel: "box_office",
      paymentMethod: "consignment",
      voidedAt: null,
    },
    include: {
      tickets: {
        where: { status: "active" },
        select: { id: true, consignmentState: true },
      },
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const wanted = input.ticketIds?.length
    ? new Set(input.ticketIds)
    : null;
  const toMark = order.tickets.filter((t) => {
    if (wanted && !wanted.has(t.id)) return false;
    return t.consignmentState !== "sold";
  });
  if (toMark.length === 0) throw new Error("NOTHING_TO_MARK");

  const now = new Date();
  await prisma.ticket.updateMany({
    where: { id: { in: toMark.map((t) => t.id) } },
    data: { consignmentState: "sold", consignmentSoldAt: now },
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "box_office.consignment.marked_sold",
    entityType: "order",
    entityId: order.id,
    after: { ticketIds: toMark.map((t) => t.id), count: toMark.length },
  });

  let emailedTo: string | null = null;
  if (input.toEmail?.trim()) {
    const mail = await emailBoxOfficeTickets({
      orderId: order.id,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      toEmail: input.toEmail.trim(),
    });
    emailedTo = mail.to;
  }

  return {
    soldCount: toMark.length,
    ticketIds: toMark.map((t) => t.id),
    emailedTo,
  };
}

/** Storno nur der noch nicht final verkauften (assigned) Tickets. */
export async function cancelBoxOfficeConsignmentRemaining(input: {
  organizationId: string;
  actorUserId: string;
  orderId: string;
}) {
  const order = await prisma.order.findFirst({
    where: {
      id: input.orderId,
      organizationId: input.organizationId,
      channel: "box_office",
      paymentMethod: "consignment",
    },
    include: {
      tickets: { select: { id: true, status: true, consignmentState: true } },
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const remainingIds = order.tickets
    .filter(
      (t) =>
        t.status === "active" &&
        (t.consignmentState === "assigned" || t.consignmentState == null),
    )
    .map((t) => t.id);
  if (remainingIds.length === 0) throw new Error("NOTHING_TO_CANCEL");

  const result = await voidBoxOfficeOrder({
    orderId: order.id,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    reason: "Kontingent Vorverkaufsstelle: Restbestand storniert",
    ticketIds: remainingIds,
  });

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "box_office.consignment.cancelled_remaining",
    entityType: "order",
    entityId: order.id,
    after: { voidedTicketIds: result.voidedTicketIds },
  });

  return result;
}
