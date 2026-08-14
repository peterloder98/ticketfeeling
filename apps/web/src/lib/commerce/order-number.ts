import type { Prisma } from "@prisma/client";

export type OrderNumberPrefix = "TF-B" | "TF-K";

export const TICKET_NUMBER_PREFIX = "TF-T";

export function formatTicketNumber(year: number, seq: number): string {
  return `${TICKET_NUMBER_PREFIX}-${year}-${String(seq).padStart(8, "0")}`;
}

/** Numbers for a batch after atomically incrementing lastNumber by `count`. */
export function ticketNumbersFromLast(year: number, lastAfter: number, count: number): string[] {
  const start = lastAfter - count + 1;
  if (count < 1 || start < 1) return [];
  return Array.from({ length: count }, (_, i) => formatTicketNumber(year, start + i));
}

/**
 * Allocate the next order number atomically via InvoiceNumberSequence
 * (same pattern as TF-R invoices). Seeds from existing max on first use
 * so production orgs don't collide with historical count+1 numbers.
 */
export async function allocateOrderNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  prefix: OrderNumberPrefix,
): Promise<string> {
  const year = new Date().getFullYear();
  const key = { organizationId, year, prefix };
  const numberPrefix = `${prefix}-${year}-`;

  let seq = await tx.invoiceNumberSequence.findUnique({
    where: { organizationId_year_prefix: key },
  });

  if (!seq) {
    const last = await tx.order.findFirst({
      where: { organizationId, orderNumber: { startsWith: numberPrefix } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    const seedRaw = last
      ? Number.parseInt(last.orderNumber.slice(numberPrefix.length), 10)
      : 0;
    const seed = Number.isFinite(seedRaw) ? seedRaw : 0;
    try {
      seq = await tx.invoiceNumberSequence.create({
        data: {
          organizationId,
          year,
          prefix,
          lastNumber: seed,
        },
      });
    } catch {
      seq = await tx.invoiceNumberSequence.findUniqueOrThrow({
        where: { organizationId_year_prefix: key },
      });
    }
  }

  const updated = await tx.invoiceNumberSequence.update({
    where: { id: seq.id },
    data: { lastNumber: { increment: 1 } },
  });

  return `${numberPrefix}${String(updated.lastNumber).padStart(6, "0")}`;
}

/**
 * Allocate `count` ticket numbers atomically via InvoiceNumberSequence (prefix TF-T).
 * Seeds from existing max on first use so production orgs don't collide.
 */
export async function allocateTicketNumbers(
  tx: Prisma.TransactionClient,
  organizationId: string,
  count: number,
): Promise<string[]> {
  if (count < 1) return [];
  const year = new Date().getFullYear();
  const prefix = TICKET_NUMBER_PREFIX;
  const key = { organizationId, year, prefix };
  const numberPrefix = `${prefix}-${year}-`;

  let seq = await tx.invoiceNumberSequence.findUnique({
    where: { organizationId_year_prefix: key },
  });

  if (!seq) {
    const last = await tx.ticket.findFirst({
      where: { organizationId, ticketNumber: { startsWith: numberPrefix } },
      orderBy: { ticketNumber: "desc" },
      select: { ticketNumber: true },
    });
    const seedRaw = last
      ? Number.parseInt(last.ticketNumber.slice(numberPrefix.length), 10)
      : 0;
    const seed = Number.isFinite(seedRaw) ? seedRaw : 0;
    try {
      seq = await tx.invoiceNumberSequence.create({
        data: {
          organizationId,
          year,
          prefix,
          lastNumber: seed,
        },
      });
    } catch {
      seq = await tx.invoiceNumberSequence.findUniqueOrThrow({
        where: { organizationId_year_prefix: key },
      });
    }
  }

  const updated = await tx.invoiceNumberSequence.update({
    where: { id: seq.id },
    data: { lastNumber: { increment: count } },
  });

  return ticketNumbersFromLast(year, updated.lastNumber, count);
}
