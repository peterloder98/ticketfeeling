import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import {
  buildOrderPaidTicketsMail,
  formatEventDateForSubject,
} from "@/lib/email/ticket-mail";
import {
  buildOrderStaffNotificationMail,
  resolveOrderNotificationRecipients,
} from "@/lib/email/order-staff-mail";
import { withOrderAccessQuery } from "@/lib/commerce/order-access";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import { getAccountingProvider } from "@/lib/accounting/provider";
import { mergeSameCategoryLines } from "@/lib/commerce/merge-category-lines";
import { formatDeDateTime } from "@/lib/datetime-de";
import {
  JobNeedsAttentionError,
  JobPermanentError,
  enqueueJob,
  kickJob,
  registerJobHandler,
} from "@/lib/jobs/queue";

let registered = false;

export function ensureJobHandlersRegistered() {
  if (registered) return;
  registered = true;

  registerJobHandler("order.post_fulfill", async (payload) => {
    const orderId = String(payload.orderId ?? "");
    if (!orderId) throw new JobPermanentError("ORDER_ID_REQUIRED");
    await runPostFulfillSideEffects(orderId);
  });

  registerJobHandler("order.send_ticket_email", async (payload) => {
    const orderId = String(payload.orderId ?? "");
    if (!orderId) throw new JobPermanentError("ORDER_ID_REQUIRED");
    await sendBuyerTicketEmail(orderId);
  });

  registerJobHandler("order.accounting_stub", async (payload) => {
    const orderId = String(payload.orderId ?? "");
    const invoiceId = payload.invoiceId ? String(payload.invoiceId) : null;
    if (!orderId) throw new JobPermanentError("ORDER_ID_REQUIRED");
    await runAccountingStub(orderId, invoiceId);
  });

  registerJobHandler("reconcile.heal_order", async (payload) => {
    const orderId = String(payload.orderId ?? "");
    if (!orderId) throw new JobPermanentError("ORDER_ID_REQUIRED");
    await healPaidOrder(orderId);
  });

  registerJobHandler("email.send", async (payload) => {
    // Generic re-send via outbox — payload must include full send fields
    const organizationId = String(payload.organizationId ?? "");
    const to = payload.to;
    const template = String(payload.template ?? "");
    const subject = String(payload.subject ?? "");
    if (!organizationId || !to || !template || !subject) {
      throw new JobPermanentError("EMAIL_PAYLOAD_INCOMPLETE");
    }
    const result = await enqueueTransactionalEmail({
      organizationId,
      to: to as string | string[],
      template,
      subject,
      payload: (payload.mailPayload as Record<string, unknown>) ?? {},
      text: typeof payload.text === "string" ? payload.text : undefined,
      html: typeof payload.html === "string" ? payload.html : undefined,
      embedLogo: payload.embedLogo !== false,
      orderId: typeof payload.orderId === "string" ? payload.orderId : undefined,
      trackDelivery: true,
    });
    if (result.provider === "stub" && result.reason === "smtp_not_configured") {
      throw new Error("TEMP: smtp_not_configured");
    }
  });
}

ensureJobHandlersRegistered();

export async function enqueuePostFulfillJobs(orderId: string, organizationId: string) {
  ensureJobHandlersRegistered();
  const { id } = await enqueueJob({
    type: "order.post_fulfill",
    organizationId,
    dedupeKey: `order.post_fulfill:${orderId}`,
    payload: { orderId },
    maxAttempts: 10,
  });
  kickJob(id);
  return id;
}

async function runPostFulfillSideEffects(orderId: string) {
  const { isDemoOrderContract } = await import("@/lib/commerce/customers");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      organizationId: true,
      contractSnapshot: true,
      invoices: { take: 1, select: { id: true } },
    },
  });
  if (!order) return;
  if (isDemoOrderContract(order.contractSnapshot)) {
    await writeAudit({
      organizationId: order.organizationId,
      action: "email.demo_order_skipped",
      entityType: "order",
      entityId: orderId,
      after: { reason: "demo_seed" },
    });
    return;
  }

  await sendBuyerTicketEmail(orderId);
  await sendStaffOrderEmail(orderId);
  if (order.invoices[0]?.id) {
    await runAccountingStub(orderId, order.invoices[0].id);
  }
}

async function sendBuyerTicketEmail(orderId: string) {
  const fresh = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      tickets: { include: { event: { include: { location: true } } } },
      invoices: true,
      items: true,
      payments: true,
    },
  });
  if (!fresh) throw new JobPermanentError("ORDER_NOT_FOUND");
  if (fresh.channel === "box_office") return;
  if (fresh.ticketSentAt) return;
  if (!fresh.customer.email) throw new JobPermanentError("NO_CUSTOMER_EMAIL");
  if (!fresh.tickets.length) {
    throw new Error("TEMP: tickets_not_ready");
  }

  // Hard bounce suppression — never void tickets
  const bounced = await prisma.emailDelivery.findFirst({
    where: {
      organizationId: fresh.organizationId,
      toEmail: fresh.customer.email.toLowerCase(),
      status: "BOUNCED",
    },
    orderBy: { createdAt: "desc" },
  });
  if (bounced) {
    await writeAudit({
      organizationId: fresh.organizationId,
      action: "email.suppressed_bounce",
      entityType: "order",
      entityId: fresh.id,
      after: { to: fresh.customer.email.toLowerCase(), deliveryId: bounced.id },
    });
    return;
  }

  const appBase = getPublicAppUrl();
  const event = fresh.tickets[0]?.event ?? null;
  const eventName =
    fresh.tickets[0]?.eventNameSnapshot ||
    fresh.items[0]?.eventNameSnapshot ||
    "dein Event";
  const startsAt = event?.eventStartsAt ?? fresh.items[0]?.eventStartsAtSnapshot ?? null;
  const whenLabel = startsAt
    ? formatDeDateTime(startsAt, { dateStyle: "full", timeStyle: "short" })
    : "Termin siehe Ticket";
  const loc = event?.location;
  const locationLabel = loc
    ? [
        loc.name,
        [loc.street, loc.houseNumber].filter(Boolean).join(" "),
        [loc.postalCode, loc.city].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    : fresh.items[0]?.locationSnapshot ?? null;
  const eventDateLabel = formatEventDateForSubject(startsAt);

  const invoiceRow = fresh.invoices[0];
  let invoiceAttachmentNumber: string | null = null;
  let invoiceDownloadUrl: string | null = null;
  if (invoiceRow && fresh.invoiceRequested) {
    invoiceAttachmentNumber = invoiceRow.invoiceNumber;
  }

  const { signOrderAccessToken } = await import("@/lib/commerce/order-access");
  const mailAccessToken = signOrderAccessToken(fresh.id, 30 * 24 * 60 * 60 * 1000);
  if (invoiceRow && fresh.invoiceRequested) {
    const path = `/api/v1/invoices/${invoiceRow.id}/pdf`;
    invoiceDownloadUrl = `${appBase}${withOrderAccessQuery(path, mailAccessToken)}`;
  }

  const mail = buildOrderPaidTicketsMail({
    firstName: fresh.customer.firstName,
    lastName: fresh.customer.lastName,
    gender: fresh.customer.gender,
    salutation: fresh.customer.salutation,
    eventName,
    whenLabel,
    eventDateLabel,
    locationLabel,
    orderId: fresh.id,
    orderNumber: fresh.orderNumber,
    ticketCount: fresh.tickets.length,
    hasAttachment: false,
    invoiceNumber: invoiceAttachmentNumber,
    invoiceDownloadUrl,
    firstTicketId: fresh.tickets[0]?.id ?? null,
    accessToken: mailAccessToken,
  });

  const sendResult = await enqueueTransactionalEmail({
    organizationId: fresh.organizationId,
    to: fresh.customer.email,
    template: "order_paid_tickets",
    subject: mail.subject,
    payload: {
      orderNumber: fresh.orderNumber,
      ticketCount: fresh.tickets.length,
      invoiceNumber: fresh.invoices[0]?.invoiceNumber,
      invoiceRequested: fresh.invoiceRequested,
      eventName,
      eventDate: eventDateLabel,
    },
    text: mail.text,
    html: mail.html,
    embedLogo: true,
    orderId: fresh.id,
    trackDelivery: true,
  });

  if (sendResult.provider === "smtp") {
    await prisma.order.update({
      where: { id: fresh.id },
      data: {
        ticketSentAt: new Date(),
        deliveryEmailedAt: new Date(),
        deliveryStatus:
          fresh.deliveryStatus === "printed" || fresh.deliveryStatus === "both"
            ? "both"
            : "emailed",
      },
    });
  } else if (sendResult.provider === "stub" && sendResult.reason === "smtp_not_configured") {
    throw new Error("TEMP: smtp_not_configured");
  } else if (sendResult.provider === "stub" && sendResult.reason === "local_guest") {
    return;
  } else {
    throw new Error(`TEMP: email_not_delivered:${sendResult.provider}`);
  }
}

async function sendStaffOrderEmail(orderId: string) {
  const fresh = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      tickets: { include: { event: { include: { location: true } } } },
      invoices: true,
      items: true,
      payments: true,
      soldByUser: { select: { name: true, email: true } },
    },
  });
  if (!fresh) return;

  const alreadyNotified = await prisma.auditLog.findFirst({
    where: {
      organizationId: fresh.organizationId,
      entityType: "order",
      entityId: fresh.id,
      action: "email.order_staff_notified",
    },
    select: { id: true },
  });
  if (alreadyNotified) return;

  const recipients = await resolveOrderNotificationRecipients(fresh.organizationId);
  if (recipients.to.length === 0) {
    await writeAudit({
      organizationId: fresh.organizationId,
      action: "email.order_staff_skipped",
      entityType: "order",
      entityId: fresh.id,
      after: {
        reason: "no_recipients",
        skipped: recipients.skipped,
        source: recipients.source,
      },
    });
    return;
  }

  const appBase = getPublicAppUrl();
  const event = fresh.tickets[0]?.event ?? null;
  const eventName =
    fresh.tickets[0]?.eventNameSnapshot ||
    fresh.items[0]?.eventNameSnapshot ||
    "Event";
  const startsAt = event?.eventStartsAt ?? fresh.items[0]?.eventStartsAtSnapshot ?? null;
  const whenLabel = startsAt
    ? formatDeDateTime(startsAt, { dateStyle: "full", timeStyle: "short" })
    : "Termin siehe Bestellung";
  const loc = event?.location;
  const locationLabel = loc
    ? [
        loc.name,
        [loc.street, loc.houseNumber].filter(Boolean).join(" "),
        [loc.postalCode, loc.city].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    : fresh.items[0]?.locationSnapshot ?? null;
  const paidPayment = fresh.payments.find((p) => p.status === "paid");
  const paymentMethod = paidPayment?.method ?? fresh.paymentMethod ?? null;
  const buyerName =
    [fresh.customer.firstName, fresh.customer.lastName].filter(Boolean).join(" ").trim() ||
    "Unbekannt";
  const categories = mergeSameCategoryLines(
    fresh.items.map((item) => ({
      quantity: item.quantity,
      categoryLabel: item.categorySnapshot || item.productNameSnapshot,
      unitPriceCents: item.unitPaidGrossCents || item.unitListGrossCents,
      lineGrossCents: item.grossCents,
      eventKey: item.eventId,
    })),
  ).map((line) => ({
    name: line.categoryLabel,
    quantity: line.quantity,
    grossCents: line.lineGrossCents,
  }));
  const invoiceRow = fresh.invoices[0];
  const invoiceDownloadUrl = invoiceRow
    ? `${appBase}/api/v1/invoices/${invoiceRow.id}/pdf`
    : null;
  const staffMail = buildOrderStaffNotificationMail({
    orderId: fresh.id,
    orderNumber: fresh.orderNumber,
    channel: fresh.channel,
    eventName,
    whenLabel,
    locationLabel,
    buyerName,
    buyerEmail: fresh.customer.email,
    sellerName: fresh.soldByUser?.name ?? null,
    sellerEmail: fresh.soldByUser?.email ?? null,
    ticketCount: fresh.tickets.length || categories.reduce((n, c) => n + c.quantity, 0),
    categories,
    totalCents: fresh.customerTotalCents || fresh.grossCents,
    currency: fresh.currency,
    paymentMethod,
    invoiceNumber: invoiceRow?.invoiceNumber ?? null,
    invoiceId: invoiceRow?.id ?? null,
    invoiceDownloadUrl,
  });
  const staffSend = await enqueueTransactionalEmail({
    organizationId: fresh.organizationId,
    to: recipients.to,
    template: "order_staff_notification",
    subject: staffMail.subject,
    payload: {
      orderNumber: fresh.orderNumber,
      recipients: recipients.to,
      source: recipients.source,
    },
    text: staffMail.text,
    html: staffMail.html,
    embedLogo: true,
    orderId: fresh.id,
    trackDelivery: true,
  });
  await writeAudit({
    organizationId: fresh.organizationId,
    action: "email.order_staff_notified",
    entityType: "order",
    entityId: fresh.id,
    after: {
      to: recipients.to,
      source: recipients.source,
      skipped: recipients.skipped,
      provider: staffSend.provider,
      reason: "reason" in staffSend ? staffSend.reason : null,
    },
  });
}

async function runAccountingStub(orderId: string, invoiceId: string | null) {
  if (!invoiceId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { invoices: { take: 1 } },
    });
    invoiceId = order?.invoices[0]?.id ?? null;
  }
  if (!invoiceId) return;

  try {
    const sync = await getAccountingProvider().createInvoice({ invoiceId });
    await prisma.order.update({
      where: { id: orderId },
      data: {
        lexofficeVoucherId: sync.externalId,
        lexofficeSyncStatus: "queued",
        lexofficeSyncedAt: null,
      },
    });
  } catch (error) {
    // Stub / unimplemented provider — isolate, don't fail the whole post-fulfill
    console.error("[jobs] accounting sync skipped", invoiceId, error);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        lexofficeSyncStatus: "queued",
        lexofficeSyncedAt: null,
      },
    });
  }
}

/**
 * Self-heal only unambiguous cases: paid Stripe order missing tickets.
 * Ambiguous states → NEEDS_ATTENTION.
 */
async function healPaidOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tickets: { select: { id: true } },
      payments: true,
      invoices: { select: { id: true, pdfData: true } },
    },
  });
  if (!order) throw new JobPermanentError("ORDER_NOT_FOUND");

  const paidPayment = order.payments.find((p) => p.status === "paid");
  const isPaid =
    order.paymentStatus === "paid" ||
    order.status === "paid" ||
    order.status === "fulfilled" ||
    Boolean(paidPayment);

  if (!isPaid) {
    throw new JobNeedsAttentionError("order_not_unambiguously_paid");
  }

  if (order.paymentStatus === "needs_review") {
    throw new JobNeedsAttentionError("needs_review_requires_human");
  }

  if (order.tickets.length === 0) {
    if (!paidPayment) {
      throw new JobNeedsAttentionError("paid_flag_without_payment_row");
    }
    const { fulfillPaidOrder } = await import("@/lib/commerce/fulfillment");
    await fulfillPaidOrder(orderId);
    await enqueuePostFulfillJobs(orderId, order.organizationId);
    return;
  }

  // Tickets exist but mail missing
  if (!order.ticketSentAt && order.channel !== "box_office") {
    await sendBuyerTicketEmail(orderId);
  }

  // Invoice PDF missing — regenerate via fulfillment idempotent path is heavy;
  // flag if invoice row exists without pdf after tickets.
  const invoice = order.invoices[0];
  if (invoice && !invoice.pdfData) {
    await writeAudit({
      organizationId: order.organizationId,
      action: "reconcile.invoice_pdf_missing",
      entityType: "invoice",
      entityId: invoice.id,
      after: { orderId },
    });
    // Non-fatal — PDF can be regenerated on download in many paths
  }
}
