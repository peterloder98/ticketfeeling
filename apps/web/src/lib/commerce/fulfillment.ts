import { prisma } from "@/lib/db";
import { createSecureToken, hashToken } from "@/lib/crypto-token";
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
import { lexwareStubProvider } from "@/lib/accounting/lexware-stub";
import { buildInvoiceTicketDescription } from "@/lib/commerce/invoice-description";
import { mergeSameCategoryLines } from "@/lib/commerce/merge-category-lines";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";
import { buildBillingSellerIdentity, sellerSnapshotPayload } from "@/lib/legal/seller";
import type { Prisma } from "@prisma/client";

type SeatLike = {
  id: string;
  blockLabel: string;
  rowLabel: string;
  seatNumber: string;
  blockObjectId?: string;
  rowIndex?: number;
  seatIndex?: number;
};

/** Pair held seats into wheelchair + adjacent companion. */
function pairAdjacentSeats(seats: SeatLike[], pairCount: number) {
  const remaining = [...seats];
  const pairs: { primary: SeatLike | null; companion: SeatLike | null }[] = [];

  for (let p = 0; p < pairCount; p += 1) {
    if (remaining.length === 0) {
      pairs.push({ primary: null, companion: null });
      continue;
    }
    const primary = remaining.shift()!;
    let companionIdx = remaining.findIndex((s) => {
      if (
        typeof primary.blockObjectId === "string" &&
        typeof primary.rowIndex === "number" &&
        typeof primary.seatIndex === "number" &&
        typeof s.blockObjectId === "string" &&
        typeof s.rowIndex === "number" &&
        typeof s.seatIndex === "number"
      ) {
        return (
          s.blockObjectId === primary.blockObjectId &&
          s.rowIndex === primary.rowIndex &&
          Math.abs(s.seatIndex - primary.seatIndex) === 1
        );
      }
      return (
        s.blockLabel === primary.blockLabel &&
        s.rowLabel === primary.rowLabel &&
        Math.abs(Number(s.seatNumber) - Number(primary.seatNumber)) === 1
      );
    });
    if (companionIdx < 0 && remaining.length > 0) companionIdx = 0;
    const companion = companionIdx >= 0 ? remaining.splice(companionIdx, 1)[0] ?? null : null;
    pairs.push({ primary, companion });
  }

  return pairs;
}

function feeInvoiceLines(order: {
  feeGrossCents: number;
  feeNetCents: number;
  feeTaxCents: number;
  administrationFeePercentageBasisPoints?: number;
  administrationFeeTaxAllocations?: Prisma.JsonValue;
  feeSnapshot: Prisma.JsonValue;
}): {
  description: string;
  quantity: number;
  taxRateBps: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
}[] {
  if (order.feeGrossCents <= 0) return [];

  const pct =
    order.administrationFeePercentageBasisPoints &&
    order.administrationFeePercentageBasisPoints > 0
      ? ` ${(order.administrationFeePercentageBasisPoints / 100).toFixed(2).replace(".", ",")} %`
      : "";

  const snap =
    typeof order.feeSnapshot === "object" && order.feeSnapshot && !Array.isArray(order.feeSnapshot)
      ? (order.feeSnapshot as {
          config?: { displayName?: string };
          label?: string;
          allocations?: {
            taxRateBasisPoints: number;
            grossAmountCents: number;
            netAmountCents: number;
            taxAmountCents: number;
          }[];
        })
      : null;

  const displayName = snap?.config?.displayName ?? snap?.label ?? "Verwaltungsgebühr";
  const allocations =
    Array.isArray(order.administrationFeeTaxAllocations) &&
    order.administrationFeeTaxAllocations.length > 0
      ? (order.administrationFeeTaxAllocations as {
          taxRateBasisPoints: number;
          grossAmountCents: number;
          netAmountCents: number;
          taxAmountCents: number;
        }[])
      : snap?.allocations;

  if (allocations && allocations.length > 1) {
    return allocations
      .filter((a) => a.grossAmountCents > 0)
      .map((a) => ({
        description: `${displayName}${pct} (${(a.taxRateBasisPoints / 100).toFixed(0)} % USt)`,
        quantity: 1,
        taxRateBps: a.taxRateBasisPoints,
        netCents: a.netAmountCents,
        taxCents: a.taxAmountCents,
        grossCents: a.grossAmountCents,
      }));
  }

  const taxBps = allocations?.[0]?.taxRateBasisPoints ?? 700;
  return [
    {
      description: `${displayName}${pct}`,
      quantity: 1,
      taxRateBps: taxBps,
      netCents: order.feeNetCents,
      taxCents: order.feeTaxCents,
      grossCents: order.feeGrossCents,
    },
  ];
}

/**
 * Idempotent fulfillment after payment is confirmed.
 * Safe against duplicate webhooks via fulfillmentLockedAt + payment status checks.
 */
export async function fulfillPaidOrder(orderId: string) {
  await ensureSeatingAssignmentSchema(prisma);
  return prisma
    .$transaction(
      async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        customer: true,
        organization: { include: { settings: true } },
        tickets: true,
        invoices: true,
        payments: true,
      },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");

    const paidPayment = order.payments.find((p) => p.status === "paid");
    if (!paidPayment) throw new Error("PAYMENT_NOT_PAID");
    // Never fulfill on SEPA early-release — only after confirmed paid.
    if (String(paidPayment.rawStatus ?? "").includes("early_release")) {
      throw new Error("PAYMENT_EARLY_RELEASE_FORBIDDEN");
    }
    // Trust a settled payment row. Box-office/cash creates payment=paid while
    // older paths left order.paymentStatus unset → false PAYMENT_NOT_CONFIRMED.
    if (
      order.paymentStatus === "processing" &&
      paidPayment.provider !== "box_office" &&
      paidPayment.provider !== "dev"
    ) {
      throw new Error("PAYMENT_NOT_CONFIRMED");
    }

    if (order.fulfillmentLockedAt && order.status === "fulfilled" && order.tickets.length > 0) {
      return { order, alreadyFulfilled: true as const };
    }

    if (!order.fulfillmentLockedAt) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "paid",
          paidAt: paidPayment.paidAt ?? new Date(),
          fulfillmentLockedAt: new Date(),
        },
      });
    }

    // Holds + seats in one query — reused below when minting tickets.
    const cartItems = order.cartId
      ? await tx.cartItem.findMany({
          where: { cartId: order.cartId },
          include: {
            hold: true,
            seats: {
              where: { status: "held" },
              orderBy: [{ blockLabel: "asc" }, { rowIndex: "asc" }, { seatIndex: "asc" }],
            },
          },
        })
      : [];

    for (const item of cartItems) {
      if (!item.hold || item.hold.status === "consumed") continue;
      if (item.hold.status === "held") {
        await tx.inventoryHold.update({
          where: { id: item.hold.id },
          data: { status: "consumed" },
        });
        await tx.inventoryPool.update({
          where: { id: item.hold.poolId },
          data: {
            heldQuantity: { decrement: item.hold.quantity },
            soldQuantity: { increment: item.hold.quantity },
          },
        });
      }
    }

    // Invoice (once)
    let invoice = order.invoices[0];
    if (!invoice) {
      const year = new Date().getFullYear();
      const seq = await tx.invoiceNumberSequence.upsert({
        where: {
          organizationId_year_prefix: {
            organizationId: order.organizationId,
            year,
            prefix: "TF-R",
          },
        },
        update: { lastNumber: { increment: 1 } },
        create: {
          organizationId: order.organizationId,
          year,
          prefix: "TF-R",
          lastNumber: 1,
        },
      });
      const current = await tx.invoiceNumberSequence.findUniqueOrThrow({
        where: { id: seq.id },
      });
      const invoiceNumber = `TF-R-${year}-${String(current.lastNumber).padStart(6, "0")}`;

      const billing =
        order.billingSnapshot &&
        typeof order.billingSnapshot === "object" &&
        !Array.isArray(order.billingSnapshot)
          ? (order.billingSnapshot as Record<string, unknown>)
          : {};
      const buyerSnapshot = order.invoiceRequested
        ? {
            ...billing,
            invoiceRequested: true,
            recipientType: order.invoiceRecipientType,
            companyName: order.invoiceCompanyName,
            contactName: order.invoiceContactName,
            vatId: order.invoiceVatId,
            orderReference: order.invoiceOrderReference,
            street: order.invoiceStreet ?? billing.street,
            houseNumber: order.invoiceHouseNumber ?? billing.houseNumber,
            postalCode: order.invoicePostalCode ?? billing.postalCode,
            city: order.invoiceCity ?? billing.city,
            country: order.invoiceCountry ?? billing.country,
          }
        : billing;

      // Invoice seller = billing address only (tax/accounting). Order sellerSnapshot stays public.
      const billingSeller = buildBillingSellerIdentity(
        order.organization,
        order.organization.settings,
      );
      const invoiceSellerSnapshot = sellerSnapshotPayload(billingSeller, "seller");

      invoice = await tx.invoice.create({
        data: {
          organizationId: order.organizationId,
          orderId: order.id,
          invoiceNumber,
          status: "final",
          currency: order.currency,
          netCents: order.netCents,
          taxCents: order.taxCents,
          grossCents: order.grossCents,
          sellerSnapshot: invoiceSellerSnapshot,
          buyerSnapshot: buyerSnapshot as Prisma.InputJsonValue,
          items: {
            create: [
              ...mergeSameCategoryLines(
                order.items.map((item) => ({
                  quantity: item.quantity,
                  categoryLabel: item.categorySnapshot,
                  unitPriceCents: item.unitPaidGrossCents || item.unitListGrossCents,
                  lineGrossCents: item.grossCents,
                  lineNetCents: item.netCents,
                  lineTaxCents: item.taxCents,
                  eventKey: item.eventId,
                  taxRateBps: item.taxRateBps,
                  description: buildInvoiceTicketDescription(item),
                })),
              ).map((line) => ({
                description: line.description,
                quantity: line.quantity,
                taxRateBps: line.taxRateBps,
                netCents: line.lineNetCents ?? 0,
                taxCents: line.lineTaxCents ?? 0,
                grossCents: line.lineGrossCents,
              })),
              ...feeInvoiceLines(order),
            ],
          },
        },
      });
    }

    // Tickets (once per order item quantity) — batch inserts to stay under DB RTT limits
    if (order.tickets.length === 0) {
      const year = new Date().getFullYear();
      const prefix = `TF-T-${year}-`;
      const lastTicket = await tx.ticket.findFirst({
        where: {
          organizationId: order.organizationId,
          ticketNumber: { startsWith: prefix },
        },
        orderBy: { ticketNumber: "desc" },
        select: { ticketNumber: true },
      });
      const lastSeq = lastTicket
        ? Number.parseInt(lastTicket.ticketNumber.slice(prefix.length), 10)
        : 0;
      let seq = Number.isFinite(lastSeq) ? lastSeq : 0;

      const cartItemsWithSeats = cartItems;
      const usedCartItemIds = new Set<string>();

      const categoryIds = [...new Set(order.items.map((i) => i.categoryId).filter(Boolean))];
      const categories = categoryIds.length
        ? await tx.eventTicketCategory.findMany({
            where: { id: { in: categoryIds as string[] } },
            select: { id: true, companionFree: true, categoryKind: true, name: true },
          })
        : [];
      const categoryById = new Map(categories.map((c) => [c.id, c]));
      const organizationId = order.organizationId;
      const fulfilledOrderId = order.id;
      const holderCustomerId = order.customerId;
      type OrderItemRow = (typeof order.items)[number];
      type SeatRef = {
        id: string;
        blockLabel: string;
        rowLabel: string;
        seatNumber: string;
      } | null;

      type PlannedTicket = {
        item: OrderItemRow;
        seat: SeatRef;
        categorySnapshot: string;
        token: string;
        ticketNumber: string;
        seatLabel: string | null;
      };

      const planned: PlannedTicket[] = [];

      function planTicket(opts: {
        item: OrderItemRow;
        seat: SeatRef;
        categorySnapshot: string;
      }) {
        seq += 1;
        const token = createSecureToken(32);
        planned.push({
          item: opts.item,
          seat: opts.seat,
          categorySnapshot: opts.categorySnapshot,
          token,
          ticketNumber: `${prefix}${String(seq).padStart(8, "0")}`,
          seatLabel: opts.seat
            ? `${opts.seat.blockLabel} · Reihe ${opts.seat.rowLabel} · Platz ${opts.seat.seatNumber}`
            : null,
        });
      }

      for (const item of order.items) {
        const matchedCartItem = cartItemsWithSeats.find(
          (ci) =>
            ci.categoryId === item.categoryId &&
            ci.eventId === item.eventId &&
            !usedCartItemIds.has(ci.id),
        );
        if (matchedCartItem) usedCartItemIds.add(matchedCartItem.id);
        const cartSeats = matchedCartItem?.seats ?? [];
        const cat = item.categoryId ? categoryById.get(item.categoryId) : null;
        const companionFree =
          cat?.categoryKind === "wheelchair" && Boolean(cat.companionFree);

        if (companionFree) {
          const pairs = pairAdjacentSeats(cartSeats, item.quantity);
          for (let i = 0; i < item.quantity; i += 1) {
            const pair = pairs[i] ?? { primary: null, companion: null };
            planTicket({
              item,
              seat: pair.primary,
              categorySnapshot: item.categorySnapshot,
            });
            planTicket({
              item,
              seat: pair.companion,
              categorySnapshot: `${item.categorySnapshot} – Begleitung (frei)`,
            });
          }
        } else {
          for (let i = 0; i < item.quantity; i += 1) {
            planTicket({
              item,
              seat: cartSeats[i] ?? null,
              categorySnapshot: item.categorySnapshot,
            });
          }
        }
      }

      const createdTickets = await tx.ticket.createManyAndReturn({
        data: planned.map((p) => ({
          organizationId,
          orderId: fulfilledOrderId,
          orderItemId: p.item.id,
          eventId: p.item.eventId,
          categoryId: p.item.categoryId,
          holderCustomerId,
          ticketNumber: p.ticketNumber,
          status: "active",
          presence: "not_arrived",
          categorySnapshot: p.categorySnapshot,
          eventNameSnapshot: p.item.eventNameSnapshot,
          seatLabel: p.seatLabel,
          seatRow: p.seat?.rowLabel ?? null,
          seatNumber: p.seat?.seatNumber ?? null,
          blockLabel: p.seat?.blockLabel ?? null,
        })),
      });

      const ticketByNumber = new Map(createdTickets.map((t) => [t.ticketNumber, t]));

      if (planned.length > 0) {
        await tx.ticketQrToken.createMany({
          data: planned.map((p) => {
            const ticket = ticketByNumber.get(p.ticketNumber);
            if (!ticket) throw new Error("TICKET_CREATE_MISMATCH");
            return {
              ticketId: ticket.id,
              tokenHash: hashToken(p.token),
              token: p.token,
              status: "active",
            };
          }),
        });
      }

      for (const p of planned) {
        if (!p.seat) continue;
        const ticket = ticketByNumber.get(p.ticketNumber);
        if (!ticket) throw new Error("TICKET_CREATE_MISMATCH");
        await tx.eventSeat.update({
          where: { id: p.seat.id },
          data: {
            status: "sold",
            ticketId: ticket.id,
            holdExpiresAt: null,
            cartItemId: null,
          },
        });
      }

      const plainTokens = planned.map((p) => {
        const ticket = ticketByNumber.get(p.ticketNumber);
        if (!ticket) throw new Error("TICKET_CREATE_MISMATCH");
        return { ticketId: ticket.id, token: p.token };
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: "fulfilled" },
      });

      return {
        order,
        invoice,
        alreadyFulfilled: false as const,
        issuedTokens: plainTokens,
      };
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: "fulfilled" },
    });

    return {
      order,
      invoice,
      alreadyFulfilled: true as const,
      issuedTokens: [] as { ticketId: string; token: string }[],
    };
  },
      {
        // Remote Postgres (Supabase) RTT makes per-ticket creates exceed the 5s default.
        maxWait: 15_000,
        timeout: 60_000,
      },
    )
    .then(async (result) => {
    await writeAudit({
      organizationId: result.order.organizationId,
      action: "order.fulfilled",
      entityType: "order",
      entityId: result.order.id,
      after: {
        alreadyFulfilled: result.alreadyFulfilled,
        invoiceId: result.invoice?.id,
        tickets: result.alreadyFulfilled ? "existing" : result.issuedTokens.length,
      },
    });

    // Send buyer mail on first fulfillment, or retry if tickets exist but mail never landed.
    const shouldSendBuyerMail =
      !result.alreadyFulfilled ||
      (result.alreadyFulfilled &&
        !result.order.ticketSentAt &&
        result.order.channel !== "box_office");

    if (shouldSendBuyerMail) {
      const fresh = await prisma.order.findUnique({
        where: { id: result.order.id },
        include: {
          customer: true,
          tickets: { include: { event: { include: { location: true } } } },
          invoices: true,
          items: true,
          payments: true,
          soldByUser: { select: { name: true, email: true } },
        },
      });

      const appBase = getPublicAppUrl();

      // Tageskasse: Verkäufer wählt Druck/E-Mail am Beleg — kein Auto-Versand an Käufer
      if (fresh?.customer.email && fresh.channel !== "box_office" && !fresh.ticketSentAt) {
        const event =
          fresh.tickets[0]?.event ??
          null;
        const eventName =
          fresh.tickets[0]?.eventNameSnapshot ||
          fresh.items[0]?.eventNameSnapshot ||
          "dein Event";
        const startsAt = event?.eventStartsAt ?? fresh.items[0]?.eventStartsAtSnapshot ?? null;
        const whenLabel = startsAt
          ? startsAt.toLocaleString("de-DE", {
              timeZone: "Europe/Berlin",
              dateStyle: "full",
              timeStyle: "short",
            })
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

        // Tickets + invoice: link-only (tokenized) — never attach ticket PDF blobs
        const invoiceRow = fresh.invoices[0];
        let invoiceAttachmentNumber: string | null = null;
        let invoiceDownloadUrl: string | null = null;
        if (invoiceRow && fresh.invoiceRequested) {
          invoiceAttachmentNumber = invoiceRow.invoiceNumber;
        }

        const { signOrderAccessToken } = await import("@/lib/commerce/order-access");
        const mailAccessToken = signOrderAccessToken(
          fresh.id,
          30 * 24 * 60 * 60 * 1000,
        );
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
        });
        // Only mark emailed when SMTP actually accepted the message (not stub).
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
        } else {
          console.error(
            "[fulfillment] ticket mail NOT delivered (smtp missing or skipped)",
            fresh.id,
            sendResult.provider,
            "reason" in sendResult ? sendResult.reason : "",
          );
          await writeAudit({
            organizationId: fresh.organizationId,
            action: "email.ticket_not_delivered",
            entityType: "order",
            entityId: fresh.id,
            after: {
              to: fresh.customer.email,
              provider: sendResult.provider,
              reason: "reason" in sendResult ? sendResult.reason : null,
            },
          });
        }
      }

      // Staff „Neue Bestellung“ — every fulfilled paid order (incl. Tageskasse)
      if (fresh) {
        try {
          const alreadyNotified = await prisma.auditLog.findFirst({
            where: {
              organizationId: fresh.organizationId,
              entityType: "order",
              entityId: fresh.id,
              action: "email.order_staff_notified",
            },
            select: { id: true },
          });
          if (!alreadyNotified) {
            const recipients = await resolveOrderNotificationRecipients(fresh.organizationId);
            if (recipients.to.length > 0) {
              const event =
                fresh.tickets[0]?.event ?? null;
              const eventName =
                fresh.tickets[0]?.eventNameSnapshot ||
                fresh.items[0]?.eventNameSnapshot ||
                "Event";
              const startsAt =
                event?.eventStartsAt ?? fresh.items[0]?.eventStartsAtSnapshot ?? null;
              const whenLabel = startsAt
                ? startsAt.toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                    dateStyle: "full",
                    timeStyle: "short",
                  })
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
              const paymentMethod =
                paidPayment?.method ?? fresh.paymentMethod ?? null;
              const buyerName = [fresh.customer.firstName, fresh.customer.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() || "Unbekannt";
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
            } else {
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
            }
          }
        } catch (error) {
          console.error("[fulfillment] staff order notification failed", fresh.id, error);
        }
      }

      if (result.invoice?.id) {
        const sync = await lexwareStubProvider.createInvoice({ invoiceId: result.invoice.id });
        await prisma.order.update({
          where: { id: orderId },
          data: {
            lexofficeVoucherId: sync.externalId,
            lexofficeSyncStatus: "queued",
            lexofficeSyncedAt: null,
          },
        });
      }
    }

    return result;
  });
}
