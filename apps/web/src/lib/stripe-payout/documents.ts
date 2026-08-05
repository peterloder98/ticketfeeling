import { createHash } from "crypto";
import PDFDocument from "pdfkit";
import { getPrisma } from "@/lib/db";
import { writePayoutAudit } from "@/lib/stripe-payout/audit";
import type { PayoutDocumentType } from "@/lib/stripe-payout/types";
import { formatEuroFromCents } from "@/lib/money";
import { buildBillingSellerIdentity, formatSellerAddressBlock } from "@/lib/legal/seller";

function pdfBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

async function nextDocumentNumber(
  organizationId: string,
  documentType: PayoutDocumentType,
): Promise<string> {
  const prisma = getPrisma();
  const year = new Date().getFullYear();
  const prefix =
    documentType === "revenue_collective"
      ? "TF-ER"
      : documentType === "stripe_costs"
        ? "TF-SK"
        : "TF-SA";
  const seq = await prisma.payoutDocumentSequence.upsert({
    where: {
      organizationId_year_documentType: { organizationId, year, documentType },
    },
    create: { organizationId, year, documentType, lastNumber: 1, prefix },
    update: { lastNumber: { increment: 1 } },
  });
  const n = String(seq.lastNumber).padStart(5, "0");
  return `${prefix}-${year}-${n}`;
}

export async function buildPayoutDocumentPdf(localPayoutId: string, documentType: PayoutDocumentType) {
  const prisma = getPrisma();
  const payout = await prisma.stripePayout.findUniqueOrThrow({
    where: { id: localPayoutId },
    include: {
      balanceTransactions: true,
      organization: { include: { settings: true } },
    },
  });
  const bts = payout.balanceTransactions;
  const orders = await prisma.order.findMany({
    where: {
      id: {
        in: bts.map((b) => b.ticketfeelingOrderId).filter(Boolean) as string[],
      },
    },
    include: { invoices: true, items: true },
  });

  const billingSeller =
    payout.organization != null
      ? buildBillingSellerIdentity(payout.organization, payout.organization.settings)
      : null;

  const title =
    documentType === "revenue_collective"
      ? "Interner Erlös-Sammelbuchungsbeleg zur Stripe-Auszahlung"
      : documentType === "stripe_costs"
        ? "Interner Stripe-Kosten- und Korrekturbuchungsbeleg"
        : "Stripe-Auszahlungsabgleich";

  const buf = await pdfBuffer((doc) => {
    doc.fillColor("#0F2747").fontSize(16).text(title, { align: "left" });
    doc.moveDown(0.5);
    if (billingSeller) {
      doc.fillColor("#334155").fontSize(9);
      doc.text(billingSeller.displayName);
      for (const line of formatSellerAddressBlock(billingSeller).split("\n")) {
        doc.text(line);
      }
      doc.moveDown(0.5);
    }
    doc.fillColor("#334155").fontSize(10);
    doc.text(`Stripe-Payout-ID: ${payout.stripePayoutId}`);
    doc.text(`Status: ${payout.status} · Abgleich: ${payout.transactionReconciliationStatus}`);
    doc.text(
      `Auszahlungsbetrag: ${formatEuroFromCents(payout.amountCents)} ${payout.currency.toUpperCase()}`,
    );
    if (payout.arrivalDate) {
      doc.text(`Auszahlungsdatum: ${payout.arrivalDate.toISOString().slice(0, 10)}`);
    }
    doc.moveDown();

    if (documentType === "revenue_collective") {
      doc.fontSize(12).fillColor("#0F2747").text("Erlöse (aus Bestell-Snapshots)");
      doc.moveDown(0.3).fontSize(9).fillColor("#334155");
      let ticketGross = 0;
      let feeGross = 0;
      for (const order of orders) {
        ticketGross += order.ticketSubtotalCents || order.ticketsGrossCents;
        feeGross += order.administrationFeeGrossCents || order.feeGrossCents;
        const inv = order.invoices[0]?.invoiceNumber ?? "—";
        doc.text(
          `${inv} · ${order.orderNumber} · Tickets ${formatEuroFromCents(order.ticketSubtotalCents || order.ticketsGrossCents)} · Gebühr ${formatEuroFromCents(order.administrationFeeGrossCents || order.feeGrossCents)}`,
        );
      }
      doc.moveDown();
      doc.text(`Ticketumsatz brutto gesamt: ${formatEuroFromCents(ticketGross)}`);
      doc.text(`Verwaltungsgebühren brutto gesamt: ${formatEuroFromCents(feeGross)}`);
      doc.text(
        "Hinweis: Dies ist kein zusätzlicher Kunden-Ausgangsbeleg. Kundenrechnungen bleiben unverändert.",
      );
    }

    if (documentType === "stripe_costs") {
      doc.fontSize(12).fillColor("#0F2747").text("Stripe-Kosten und Korrekturen");
      doc.moveDown(0.3).fontSize(9).fillColor("#334155");
      const byClass = new Map<string, number>();
      for (const bt of bts) {
        if (bt.classification === "payment" || bt.classification === "payout") continue;
        byClass.set(
          bt.classification,
          (byClass.get(bt.classification) ?? 0) + bt.amountCents,
        );
      }
      for (const [k, v] of byClass) {
        doc.text(`${k}: ${formatEuroFromCents(v)}`);
      }
      doc.moveDown();
      doc.text(
        "Dieser interne Buchungsbeleg dokumentiert die von Stripe in der genannten Auszahlung berücksichtigten Kosten und Korrekturen. Er ersetzt keine von Stripe ausgestellte Gebühren-, Steuer- oder Lieferantenrechnung.",
      );
      doc.moveDown();
      for (const bt of bts.filter((b) => b.classification !== "payment" && b.classification !== "payout")) {
        doc.text(
          `${bt.stripeBalanceTransactionId} · ${bt.classification} · amount ${bt.amountCents} · fee ${bt.feeCents} · net ${bt.netCents}`,
        );
      }
    }

    if (documentType === "payout_reconciliation") {
      doc.fontSize(12).fillColor("#0F2747").text("Kontrollrechnung");
      doc.moveDown(0.3).fontSize(9).fillColor("#334155");
      const payments = bts
        .filter((b) => b.classification === "payment")
        .reduce((a, b) => a + b.netCents, 0);
      const fees = bts
        .filter((b) => b.classification === "stripe_fee" || b.classification === "dispute_fee")
        .reduce((a, b) => a + b.netCents, 0);
      const refunds = bts
        .filter((b) => b.classification === "refund")
        .reduce((a, b) => a + b.netCents, 0);
      const disputes = bts
        .filter((b) => b.classification === "dispute")
        .reduce((a, b) => a + b.netCents, 0);
      const other = bts
        .filter(
          (b) =>
            !["payment", "stripe_fee", "dispute_fee", "refund", "dispute", "payout"].includes(
              b.classification,
            ),
        )
        .reduce((a, b) => a + b.netCents, 0);
      doc.text(`Zahlungen (net): ${formatEuroFromCents(payments)}`);
      doc.text(`Stripe-Gebühren (net): ${formatEuroFromCents(fees)}`);
      doc.text(`Erstattungen (net): ${formatEuroFromCents(refunds)}`);
      doc.text(`Disputes (net): ${formatEuroFromCents(disputes)}`);
      doc.text(`Sonstige (net): ${formatEuroFromCents(other)}`);
      doc.text(`Stripe-Auszahlung: ${formatEuroFromCents(payout.amountCents)}`);
      const diff = payout.reconciliationDifferenceCents ?? 0;
      doc.moveDown();
      if (diff === 0 && payout.transactionReconciliationStatus === "reconciled") {
        doc.fillColor("#0F766E").text("Kontrollsumme: 0,00 € – Auszahlung vollständig abgestimmt");
      } else {
        doc.fillColor("#B45309").text(
          `Abweichung: ${formatEuroFromCents(diff)} – manuelle Prüfung erforderlich`,
        );
      }
      doc.fillColor("#334155");
      doc.moveDown();
      doc.text(`Balance Transactions: ${bts.length}`);
      doc.text(`Importdatum: ${payout.importedAt.toISOString()}`);
    }
  });

  return buf;
}

export async function createPayoutDocumentPreview(
  localPayoutId: string,
  documentType: PayoutDocumentType,
  userId?: string | null,
) {
  const prisma = getPrisma();
  const payout = await prisma.stripePayout.findUniqueOrThrow({ where: { id: localPayoutId } });
  if (!payout.organizationId) throw new Error("PAYOUT_ORG_REQUIRED");
  const pdf = await buildPayoutDocumentPdf(localPayoutId, documentType);
  const checksum = createHash("sha256").update(pdf).digest("hex");
  const doc = await prisma.payoutDocument.create({
    data: {
      organizationId: payout.organizationId,
      localPayoutId,
      documentType,
      status: "preview",
      generatedByUserId: userId ?? null,
      checksumSha256: checksum,
      pdfData: new Uint8Array(pdf),
      immutableStoragePath: `preview/${localPayoutId}/${documentType}/${checksum.slice(0, 12)}.pdf`,
    },
  });
  await writePayoutAudit({
    localPayoutId,
    organizationId: payout.organizationId,
    action: "document_preview_created",
    newValue: { documentType, documentId: doc.id },
    actorType: userId ? "user" : "system",
    actorId: userId ?? null,
  });
  return doc;
}

export async function finalizePayoutDocuments(localPayoutId: string, userId: string) {
  const prisma = getPrisma();
  const payout = await prisma.stripePayout.findUniqueOrThrow({
    where: { id: localPayoutId },
    include: { balanceTransactions: true },
  });
  if (!payout.organizationId) throw new Error("PAYOUT_ORG_REQUIRED");
  if (payout.transactionReconciliationStatus !== "reconciled") {
    throw new Error("PAYOUT_NOT_RECONCILED");
  }
  if ((payout.reconciliationDifferenceCents ?? 0) !== 0) {
    throw new Error("PAYOUT_DIFF_NONZERO");
  }
  if (payout.balanceTransactions.some((b) => b.classification === "unknown")) {
    throw new Error("UNKNOWN_TRANSACTIONS");
  }
  if (
    payout.balanceTransactions.some(
      (b) =>
        ["payment", "refund", "dispute"].includes(b.classification) &&
        b.mappingStatus === "unmapped",
    )
  ) {
    throw new Error("UNMAPPED_TRANSACTIONS");
  }
  if (payout.status === "failed" || payout.status === "canceled") {
    throw new Error("PAYOUT_FAILED");
  }

  const types: PayoutDocumentType[] = [
    "revenue_collective",
    "stripe_costs",
    "payout_reconciliation",
  ];
  const created = [];
  for (const documentType of types) {
    const pdf = await buildPayoutDocumentPdf(localPayoutId, documentType);
    const checksum = createHash("sha256").update(pdf).digest("hex");
    const documentNumber = await nextDocumentNumber(payout.organizationId, documentType);
    const path = `final/${payout.organizationId}/${documentNumber}.pdf`;
    const doc = await prisma.payoutDocument.create({
      data: {
        organizationId: payout.organizationId,
        localPayoutId,
        documentType,
        documentNumber,
        status: "finalized",
        generatedByUserId: userId,
        checksumSha256: checksum,
        pdfData: new Uint8Array(pdf),
        immutableStoragePath: path,
      },
    });
    created.push(doc);
  }

  await prisma.stripePayout.update({
    where: { id: localPayoutId },
    data: {
      documentStatus: "finalized",
      finalizedAt: new Date(),
      finalizedByUserId: userId,
    },
  });

  await writePayoutAudit({
    localPayoutId,
    organizationId: payout.organizationId,
    action: "documents_finalized",
    newValue: { documents: created.map((d) => d.documentNumber) },
    actorType: "user",
    actorId: userId,
  });

  return created;
}
