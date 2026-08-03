import PDFDocument from "pdfkit";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import { buildSellerIdentity, formatSellerAddress } from "@/lib/legal/seller";

const NAVY = "#0F2747";
const TEAL = "#14B8A6";
const MUTED = "#64748B";
const INK = "#0B1421";
const LINE = "#E2E8F0";

function loadLogoBuffer(): Buffer | null {
  const candidates = [
    path.join(process.cwd(), "public/brand/logo-email.png"),
    path.join(process.cwd(), "public/brand/logo-lockup-1x.png"),
    path.join(process.cwd(), "apps/web/public/brand/logo-email.png"),
    path.join(process.cwd(), "apps/web/public/brand/logo-lockup-1x.png"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        return readFileSync(file);
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateDe(date: Date) {
  return date.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function buyerLines(buyer: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const company = str(buyer.companyName);
  const contact = str(buyer.contactName);
  const first = str(buyer.firstName);
  const last = str(buyer.lastName);
  const name = [first, last].filter(Boolean).join(" ");

  if (company) lines.push(company);
  if (contact) lines.push(contact);
  else if (name && name !== company) lines.push(name);
  else if (!company && name) lines.push(name);

  const street = [str(buyer.street), str(buyer.houseNumber)].filter(Boolean).join(" ");
  if (street) lines.push(street);
  const city = [str(buyer.postalCode), str(buyer.city)].filter(Boolean).join(" ");
  if (city) lines.push(city);
  const country = str(buyer.country);
  if (country && country !== "DE") lines.push(country);
  const vatId = str(buyer.vatId);
  if (vatId) lines.push(`USt-IdNr.: ${vatId}`);
  const orderRef = str(buyer.orderReference);
  if (orderRef) lines.push(`Ihre Referenz: ${orderRef}`);
  return lines.length ? lines : ["—"];
}

function sellerLinesFromSnapshot(
  sellerSnap: Record<string, unknown>,
  fallback: ReturnType<typeof buildSellerIdentity>,
): string[] {
  const street =
    [str(sellerSnap.street) || fallback.street, str(sellerSnap.houseNumber) || fallback.houseNumber]
      .filter(Boolean)
      .join(" ") || formatSellerAddress(fallback).split(",")[0]!;
  const city =
    [str(sellerSnap.postalCode) || fallback.postalCode, str(sellerSnap.city) || fallback.city]
      .filter(Boolean)
      .join(" ");
  const lines = [
    str(sellerSnap.displayName) || fallback.displayName,
    street,
    city,
    str(sellerSnap.country) || fallback.country || "DE",
  ].filter(Boolean);
  const vat = str(sellerSnap.vatId) || fallback.vatId;
  const tax = str(sellerSnap.taxNumber) || fallback.taxNumber;
  if (vat) lines.push(`USt-IdNr.: ${vat}`);
  if (tax) lines.push(`Steuernr.: ${tax}`);
  const email = str(sellerSnap.email) || fallback.email;
  if (email) lines.push(email);
  return lines;
}

/**
 * Render a branded invoice PDF for an Invoice row (with items + order).
 * Stores nothing — caller persists buffer when needed.
 */
export async function renderInvoicePdf(invoiceId: string): Promise<{
  buffer: Buffer;
  invoiceNumber: string;
  filename: string;
}> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      order: { include: { customer: true } },
      organization: { include: { settings: true } },
    },
  });
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");

  const sellerIdentity = buildSellerIdentity(invoice.organization, invoice.organization.settings);
  const sellerSnap = asRecord(invoice.sellerSnapshot);
  const buyerSnap = {
    ...asRecord(invoice.buyerSnapshot),
    firstName: str(asRecord(invoice.buyerSnapshot).firstName) || invoice.order.customer.firstName,
    lastName: str(asRecord(invoice.buyerSnapshot).lastName) || invoice.order.customer.lastName,
  };

  const filename = `Rechnung-${invoice.invoiceNumber}.pdf`;
  const doc = new PDFDocument({ size: "A4", margin: 0, compress: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const pad = 48;
  const contentW = pageW - pad * 2;

  doc.rect(0, 0, pageW, pageH).fill("#FFFFFF");

  const headerH = 72;
  doc.rect(0, 0, pageW, headerH).fill(NAVY);
  doc.rect(0, headerH - 4, pageW, 4).fill(TEAL);

  const logo = loadLogoBuffer();
  if (logo) {
    try {
      doc.image(logo, pad, 16, { height: 40, fit: [160, 40] });
    } catch {
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("TICKETFEELING", pad, 26, { characterSpacing: 1.5 });
    }
  } else {
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("TICKETFEELING", pad, 26, { characterSpacing: 1.5 });
  }

  doc
    .fillColor(TEAL)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("RECHNUNG", pad, 28, { width: contentW, align: "right" });

  let y = headerH + 28;

  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("Deine Rechnung", pad, y, { width: contentW });
  y = doc.y + 6;

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED)
    .text(
      `Rechnungsnr. ${invoice.invoiceNumber}  ·  ${formatDateDe(invoice.issuedAt)}  ·  Bestellung ${invoice.order.orderNumber}`,
      pad,
      y,
      { width: contentW },
    );
  y = doc.y + 22;

  const colW = (contentW - 24) / 2;
  const leftX = pad;
  const rightX = pad + colW + 24;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL).text("RECHNUNGSADRESSE", leftX, y);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL).text("VERKÄUFER", rightX, y);
  y = doc.y + 8;

  const buyers = buyerLines(buyerSnap);
  const sellers = sellerLinesFromSnapshot(sellerSnap, sellerIdentity);
  const blockStart = y;

  doc.font("Helvetica").fontSize(10).fillColor(INK);
  for (const line of buyers) {
    doc.text(line, leftX, y, { width: colW });
    y = doc.y + 2;
  }
  let yRight = blockStart;
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  for (const line of sellers) {
    doc.text(line, rightX, yRight, { width: colW });
    yRight = doc.y + 2;
  }
  y = Math.max(y, yRight) + 20;

  doc
    .moveTo(pad, y)
    .lineTo(pad + contentW, y)
    .strokeColor(LINE)
    .lineWidth(1)
    .stroke();
  y += 16;

  // Table header
  const qtyX = pad;
  const descX = pad + 36;
  const netX = pad + contentW - 200;
  const taxX = pad + contentW - 130;
  const grossX = pad + contentW - 70;

  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  doc.text("Anz.", qtyX, y, { width: 32 });
  doc.text("Position", descX, y, { width: netX - descX - 8 });
  doc.text("Netto", netX, y, { width: 60, align: "right" });
  doc.text("USt", taxX, y, { width: 50, align: "right" });
  doc.text("Brutto", grossX, y, { width: 70, align: "right" });
  y = doc.y + 8;

  doc
    .moveTo(pad, y)
    .lineTo(pad + contentW, y)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
  y += 10;

  for (const item of invoice.items) {
    if (y > pageH - 140) {
      doc.addPage();
      y = pad;
    }
    const taxPct = `${(item.taxRateBps / 100).toFixed(item.taxRateBps % 100 === 0 ? 0 : 1).replace(".", ",")} %`;
    doc.font("Helvetica").fontSize(9).fillColor(INK);
    doc.text(String(item.quantity), qtyX, y, { width: 32 });
    const descH = doc.heightOfString(item.description, { width: netX - descX - 8 });
    doc.text(item.description, descX, y, { width: netX - descX - 8 });
    doc.text(formatEuroFromCents(item.netCents, invoice.currency), netX, y, {
      width: 60,
      align: "right",
    });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(taxPct, taxX, y, { width: 50, align: "right" });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(INK)
      .text(formatEuroFromCents(item.grossCents, invoice.currency), grossX, y, {
        width: 70,
        align: "right",
      });
    y += Math.max(descH, 14) + 8;
  }

  y += 6;
  doc
    .moveTo(pad, y)
    .lineTo(pad + contentW, y)
    .strokeColor(LINE)
    .lineWidth(1)
    .stroke();
  y += 14;

  const totalsX = pad + contentW - 200;
  const totalsValX = pad + contentW - 90;

  const totalRows: { label: string; value: string; bold?: boolean }[] = [
    { label: "Netto", value: formatEuroFromCents(invoice.netCents, invoice.currency) },
    { label: "Umsatzsteuer", value: formatEuroFromCents(invoice.taxCents, invoice.currency) },
    {
      label: "Gesamtbetrag",
      value: formatEuroFromCents(invoice.grossCents, invoice.currency),
      bold: true,
    },
  ];

  for (const row of totalRows) {
    doc
      .font(row.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(row.bold ? 11 : 10)
      .fillColor(row.bold ? NAVY : MUTED)
      .text(row.label, totalsX, y, { width: 100 });
    doc
      .font(row.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(row.bold ? 11 : 10)
      .fillColor(row.bold ? NAVY : INK)
      .text(row.value, totalsValX, y, { width: 90, align: "right" });
    y = doc.y + (row.bold ? 10 : 6);
  }

  y += 24;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      "Vielen Dank für deinen Kauf. Diese Rechnung gilt als Bestätigung deiner Ticketbestellung.",
      pad,
      y,
      { width: contentW },
    );
  y = doc.y + 10;
  doc.text(
    `${sellerIdentity.displayName} · ${formatSellerAddress(sellerIdentity)}`,
    pad,
    y,
    { width: contentW },
  );

  doc.end();
  const buffer = await done;
  return { buffer, invoiceNumber: invoice.invoiceNumber, filename };
}

/** Return stored PDF or render + optionally persist. */
export async function getOrCreateInvoicePdf(
  invoiceId: string,
  options?: { persist?: boolean },
): Promise<{ buffer: Buffer; invoiceNumber: string; filename: string }> {
  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, invoiceNumber: true, pdfData: true, pdfFilename: true },
  });
  if (!existing) throw new Error("INVOICE_NOT_FOUND");

  if (existing.pdfData && existing.pdfData.length > 0) {
    return {
      buffer: Buffer.from(existing.pdfData),
      invoiceNumber: existing.invoiceNumber,
      filename: existing.pdfFilename || `Rechnung-${existing.invoiceNumber}.pdf`,
    };
  }

  const pdf = await renderInvoicePdf(invoiceId);
  if (options?.persist !== false) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        pdfData: new Uint8Array(pdf.buffer),
        pdfFilename: pdf.filename,
      },
    });
  }
  return pdf;
}
