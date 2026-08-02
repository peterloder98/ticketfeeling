import { prisma } from "@/lib/db";
import { createSecureToken, hashToken } from "@/lib/crypto-token";
import { writeAudit } from "@/lib/audit";
import { enqueueTransactionalEmail } from "@/lib/email/outbox";
import {
  buildOrderPaidTicketsMail,
  formatEventDateForSubject,
} from "@/lib/email/ticket-mail";
import { lexwareStubProvider } from "@/lib/accounting/lexware-stub";
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
  return prisma.$transaction(async (tx) => {
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

    // Convert holds → sold for cart items of this order's cart
    if (order.cartId) {
      const cartItems = await tx.cartItem.findMany({
        where: { cartId: order.cartId },
        include: { hold: true },
      });
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
          sellerSnapshot: (order.sellerSnapshot as object) ?? {
            displayName: "Peter Loder – Ticketfeeling",
            email: order.organization.settings?.email,
            vatId: order.organization.settings?.vatId,
            city: order.organization.settings?.city,
          },
          buyerSnapshot: buyerSnapshot as Prisma.InputJsonValue,
          items: {
            create: [
              ...order.items.map((item) => ({
                description: `${item.eventNameSnapshot} – ${item.categorySnapshot}`,
                quantity: item.quantity,
                taxRateBps: item.taxRateBps,
                netCents: item.netCents,
                taxCents: item.taxCents,
                grossCents: item.grossCents,
              })),
              ...feeInvoiceLines(order),
            ],
          },
        },
      });
    }

    // Tickets (once per order item quantity)
    if (order.tickets.length === 0) {
      const existingCount = await tx.ticket.count({
        where: { organizationId: order.organizationId },
      });
      let seq = existingCount;
      const plainTokens: { ticketId: string; token: string }[] = [];

      const cartItemsWithSeats = order.cartId
        ? await tx.cartItem.findMany({
            where: { cartId: order.cartId },
            include: {
              seats: {
                where: { status: "held" },
                orderBy: [{ blockLabel: "asc" }, { rowIndex: "asc" }, { seatIndex: "asc" }],
              },
            },
          })
        : [];
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

      async function issueTicket(opts: {
        item: OrderItemRow;
        seat: {
          id: string;
          blockLabel: string;
          rowLabel: string;
          seatNumber: string;
        } | null;
        categorySnapshot: string;
      }) {
        seq += 1;
        const year = new Date().getFullYear();
        const ticketNumber = `TF-T-${year}-${String(seq).padStart(8, "0")}`;
        const token = createSecureToken(32);
        const seatLabel = opts.seat
          ? `${opts.seat.blockLabel} · Reihe ${opts.seat.rowLabel} · Platz ${opts.seat.seatNumber}`
          : null;
        const ticket = await tx.ticket.create({
          data: {
            organizationId,
            orderId: fulfilledOrderId,
            orderItemId: opts.item.id,
            eventId: opts.item.eventId,
            categoryId: opts.item.categoryId,
            holderCustomerId,
            ticketNumber,
            status: "active",
            presence: "not_arrived",
            categorySnapshot: opts.categorySnapshot,
            eventNameSnapshot: opts.item.eventNameSnapshot,
            seatLabel,
            seatRow: opts.seat?.rowLabel ?? null,
            seatNumber: opts.seat?.seatNumber ?? null,
            blockLabel: opts.seat?.blockLabel ?? null,
            qrTokens: {
              create: {
                tokenHash: hashToken(token),
                token,
                status: "active",
              },
            },
          },
        });
        if (opts.seat) {
          await tx.eventSeat.update({
            where: { id: opts.seat.id },
            data: {
              status: "sold",
              ticketId: ticket.id,
              holdExpiresAt: null,
              cartItemId: null,
            },
          });
        }
        plainTokens.push({ ticketId: ticket.id, token });
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
            await issueTicket({
              item,
              seat: pair.primary,
              categorySnapshot: item.categorySnapshot,
            });
            await issueTicket({
              item,
              seat: pair.companion,
              categorySnapshot: `${item.categorySnapshot} – Begleitung (frei)`,
            });
          }
        } else {
          for (let i = 0; i < item.quantity; i += 1) {
            await issueTicket({
              item,
              seat: cartSeats[i] ?? null,
              categorySnapshot: item.categorySnapshot,
            });
          }
        }
      }

      // Store tokens temporarily on audit only hashed — return plain for this request to show once
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

    return { order, invoice, alreadyFulfilled: true as const, issuedTokens: [] as { ticketId: string; token: string }[] };
  }).then(async (result) => {
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

    if (!result.alreadyFulfilled) {
      const fresh = await prisma.order.findUnique({
        where: { id: result.order.id },
        include: {
          customer: true,
          tickets: { include: { event: { include: { location: true } } } },
          invoices: true,
          items: true,
        },
      });
      // Tageskasse: Verkäufer wählt Druck/E-Mail am Beleg — kein Auto-Versand
      if (fresh?.customer.email && fresh.channel !== "box_office") {
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

        const ticketIds = fresh.tickets.map((t) => t.id);
        const pdfAttachments: { filename: string; content: Buffer }[] = [];
        try {
          const { renderOrderTicketsPdf, renderTicketPdf } = await import(
            "@/lib/commerce/ticket-pdf"
          );
          try {
            const pdf = await renderOrderTicketsPdf(fresh.id);
            if (pdf.buffer.length > 0) {
              pdfAttachments.push({ filename: pdf.filename, content: pdf.buffer });
            }
          } catch (error) {
            console.error("[fulfillment] combined pdf failed, trying singles", fresh.id, error);
          }
          if (pdfAttachments.length === 0) {
            for (const ticketId of ticketIds) {
              try {
                const pdf = await renderTicketPdf(ticketId, { compact: true });
                if (pdf.buffer.length > 0) {
                  pdfAttachments.push({ filename: pdf.filename, content: pdf.buffer });
                }
              } catch (error) {
                console.error("[fulfillment] ticket pdf failed", ticketId, error);
              }
            }
          }
        } catch (error) {
          console.error("[fulfillment] pdf module load failed", error);
        }

        const mail = buildOrderPaidTicketsMail({
          firstName: fresh.customer.firstName,
          eventName,
          whenLabel,
          eventDateLabel,
          locationLabel,
          orderId: fresh.id,
          orderNumber: fresh.orderNumber,
          ticketCount: fresh.tickets.length,
          hasAttachment: pdfAttachments.length > 0,
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
            eventName,
            eventDate: eventDateLabel,
          },
          pdfAttachments,
          orderIdForCombinedPdf: pdfAttachments.length ? undefined : fresh.id,
          ticketIds: pdfAttachments.length ? undefined : ticketIds,
          text: mail.text,
          html: mail.html,
          compactPdf: true,
          embedLogo: true,
        });
        if (sendResult.attachments < 1) {
          console.error("[fulfillment] ticket mail sent without PDF attachments", fresh.id);
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
