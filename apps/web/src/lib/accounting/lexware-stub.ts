import type { AccountingProvider, AccountingSyncStatus } from "@/lib/accounting/types";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { buildLexofficeOrderSnapshot } from "@/lib/accounting/lexoffice-order-snapshot";

/** Explicit stub — not a finished Lexware/Lexoffice integration. */
export const lexwareStubProvider: AccountingProvider = {
  key: "lexware_stub",
  async connect() {
    return { ok: false };
  },
  async disconnect() {},
  async createInvoice(input) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      include: {
        order: {
          include: { invoices: { select: { invoiceNumber: true, status: true }, take: 1 } },
        },
      },
    });
    const snapshot = invoice?.order
      ? buildLexofficeOrderSnapshot(invoice.order)
      : { invoiceId: input.invoiceId };

    await writeAudit({
      action: "accounting.invoice.queued_stub",
      entityType: "invoice",
      entityId: input.invoiceId,
      organizationId: invoice?.organizationId,
      after: {
        provider: "lexware_stub",
        note: "STUB — no API call; payload ready for Lexoffice",
        snapshot,
      },
    });
    return { externalId: `stub_${input.invoiceId}` };
  },
  async createCorrection(input) {
    return { externalId: `stub_corr_${input.correctionId}` };
  },
  async markPaid() {},
  async getSyncStatus(): Promise<AccountingSyncStatus> {
    return "queued";
  },
  async retrySync() {},
};
