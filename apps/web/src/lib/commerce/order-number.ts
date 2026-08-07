import type { Prisma } from "@prisma/client";

export type OrderNumberPrefix = "TF-B" | "TF-K";

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
