import PDFDocument from "pdfkit";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { formatEuroFromCents } from "@/lib/money";
import {
  buildBillingSellerIdentity,
  formatSellerAddress,
  formatSellerCountry,
} from "@/lib/legal/seller";
import {
  formatInvoiceEventWhen,
  formatInvoiceLocationLabel,
} from "@/lib/commerce/invoice-description";

const NAVY = "#0F2747";
const TEAL = "#14B8A6";
const MUTED = "#475569";
const INK = "#0B1421";
const LINE = "#E2E8F0";
const PAPER = "#FFFFFF";
const HEADER_BG = "#F8FAFC";

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
  fallback: ReturnType<typeof buildBillingSellerIdentity>,
): string[] {
  const street =
    [str(sellerSnap.street) || fallback.street, str(sellerSnap.houseNumber) || fallback.houseNumber]
      .filter(Boolean)
      .join(" ") || formatSellerAddress(fallback).split(",")[0]!;
  const city =
    [str(sellerSnap.postalCode) || fallback.postalCode, str(sellerSnap.city) || fallback.city]
      .filter(Boolean)
      .join(" ");
  const countryRaw = str(sellerSnap.country) || fallback.country || "DE";
  const country =
    str(sellerSnap.countryLabel) ||
    (countryRaw.length <= 3 ? formatSellerCountry({ country: countryRaw }) : countryRaw);
  const legalLine = str(sellerSnap.legalPersonLine) || fallback.legalPersonLine;
  const lines = [
    str(sellerSnap.displayName) || fallback.displayName,
    legalLine && legalLine !== (str(sellerSnap.displayName) || fallback.displayName)
      ? legalLine
      : null,
    street,
    city,
    country,
  ].filter(Boolean) as string[];
  const vat = str(sellerSnap.vatId) || fallback.vatId;
  const tax = str(sellerSnap.taxNumber) || fallback.taxNumber;
  if (vat) lines.push(`USt-IdNr.: ${vat}`);
  if (tax) lines.push(`Steuernr.: ${tax}`);
  const email = str(sellerSnap.email) || fallback.email;
  if (email) lines.push(email);
  return lines;
}

type OrderItemMeta = {
  eventNameSnapshot: string;
  categorySnapshot: string;
  eventStartsAtSnapshot: Date | null;
  locationSnapshot: string | null;
  location: {
    name: string;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
  } | null;
};

function matchOrderItemMeta(
  description: string,
  orderItems: OrderItemMeta[],
  used: Set<number>,
): OrderItemMeta | null {
  const firstLine = description.split("\n")[0]?.trim() ?? description.trim();
  for (let i = 0; i < orderItems.length; i += 1) {
    if (used.has(i)) continue;
    const item = orderItems[i]!;
    const expected = `${item.eventNameSnapshot} – ${item.categorySnapshot}`;
    if (firstLine === expected || firstLine.startsWith(`${item.eventNameSnapshot} –`)) {
      used.add(i);
      return item;
    }
  }
  // Sequential fallback for older descriptions that only had event name
  for (let i = 0; i < orderItems.length; i += 1) {
    if (used.has(i)) continue;
    const item = orderItems[i]!;
    if (
      firstLine.includes(item.eventNameSnapshot) &&
      firstLine.includes(item.categorySnapshot)
    ) {
      used.add(i);
      return item;
    }
  }
  return null;
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
      order: {
        include: {
          customer: true,
          items: {
            include: {
              event: { include: { location: true } },
            },
          },
        },
      },
      organization: { include: { settings: true } },
    },
  });
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");

  // Always prefer billing address for tax invoices (never public Landshut on Rechnung).
  const sellerIdentity = buildBillingSellerIdentity(
    invoice.organization,
    invoice.organization.settings,
  );
  const sellerSnap = asRecord(invoice.sellerSnapshot);
  // Legacy invoices may still snapshot the public address — override street fields from billing.
  const billingSnap = {
    ...sellerSnap,
    street: sellerIdentity.street,
    houseNumber: sellerIdentity.houseNumber,
    postalCode: sellerIdentity.postalCode,
    city: sellerIdentity.city,
    country: sellerIdentity.country,
    countryLabel: formatSellerCountry(sellerIdentity),
    legalPersonLine: sellerIdentity.legalPersonLine,
    addressLine: formatSellerAddress(sellerIdentity),
    addressKind: "billing",
  };
  const buyerSnap = {
    ...asRecord(invoice.buyerSnapshot),
    firstName: str(asRecord(invoice.buyerSnapshot).firstName) || invoice.order.customer.firstName,
    lastName: str(asRecord(invoice.buyerSnapshot).lastName) || invoice.order.customer.lastName,
  };

  const orderItemMeta: OrderItemMeta[] = invoice.order.items.map((item) => ({
    eventNameSnapshot: item.eventNameSnapshot,
    categorySnapshot: item.categorySnapshot,
    eventStartsAtSnapshot: item.eventStartsAtSnapshot ?? item.event.eventStartsAt,
    locationSnapshot: item.locationSnapshot,
    location: item.event.location
      ? {
          name: item.event.location.name,
          street: item.event.location.street,
          houseNumber: item.event.location.houseNumber,
          postalCode: item.event.location.postalCode,
          city: item.event.location.city,
        }
      : null,
  }));
  const usedOrderItems = new Set<number>();

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

  doc.rect(0, 0, pageW, pageH).fill(PAPER);

  // Light header — brand logo is dark; navy bar made it unreadable
  const headerH = 78;
  doc.rect(0, 0, pageW, headerH).fill(HEADER_BG);
  doc
    .moveTo(0, headerH)
    .lineTo(pageW, headerH)
    .strokeColor(TEAL)
    .lineWidth(3)
    .stroke();

  const logo = loadLogoBuffer();
  if (logo) {
    try {
      doc.image(logo, pad, 18, { height: 44, fit: [180, 44] });
    } catch {
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(16)
        .text("TICKETFEELING", pad, 28, { characterSpacing: 1.2 });
    }
  } else {
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("TICKETFEELING", pad, 28, { characterSpacing: 1.2 });
  }

  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("RECHNUNG", pad, 30, { width: contentW, align: "right" });
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(9)
    .text(formatDateDe(invoice.issuedAt), pad, 48, { width: contentW, align: "right" });

  let y = headerH + 28;

  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("Deine Rechnung", pad, y, { width: contentW });
  y = doc.y + 8;

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED)
    .text(
      `Rechnungsnr. ${invoice.invoiceNumber}  ·  Bestellung ${invoice.order.orderNumber}`,
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
  const sellers = sellerLinesFromSnapshot(billingSnap, sellerIdentity);
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
  const descW = netX - descX - 8;

  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  doc.text("Anz.", qtyX, y, { width: 32 });
  doc.text("Position", descX, y, { width: descW });
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
    if (y > pageH - 160) {
      doc.addPage();
      doc.rect(0, 0, pageW, pageH).fill(PAPER);
      y = pad;
    }

    const meta = matchOrderItemMeta(item.description, orderItemMeta, usedOrderItems);
    const titleLine = item.description.split("\n")[0]?.trim() || item.description;
    const whenLabel = meta
      ? formatInvoiceEventWhen(meta.eventStartsAtSnapshot)
      : null;
    const placeLabel = meta
      ? formatInvoiceLocationLabel({
          locationSnapshot: meta.locationSnapshot,
          location: meta.location,
        })
      : null;

    // Prefer structured meta; fall back to Datum:/Ort: lines already in description
    const detailLines: string[] = [];
    if (whenLabel) detailLines.push(`Datum: ${whenLabel}`);
    else {
      for (const line of item.description.split("\n").slice(1)) {
        if (/^Datum:/i.test(line.trim())) detailLines.push(line.trim());
      }
    }
    if (placeLabel) detailLines.push(`Ort: ${placeLabel}`);
    else {
      for (const line of item.description.split("\n").slice(1)) {
        if (/^Ort:/i.test(line.trim()) && !detailLines.some((d) => /^Ort:/i.test(d))) {
          detailLines.push(line.trim());
        }
      }
    }

    const taxPct = `${(item.taxRateBps / 100).toFixed(item.taxRateBps % 100 === 0 ? 0 : 1).replace(".", ",")} %`;
    const rowTop = y;

    doc.font("Helvetica").fontSize(9).fillColor(INK);
    doc.text(String(item.quantity), qtyX, rowTop, { width: 32 });

    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
    const titleH = doc.heightOfString(titleLine, { width: descW });
    doc.text(titleLine, descX, rowTop, { width: descW });

    let detailY = rowTop + titleH + (detailLines.length ? 3 : 0);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    for (const line of detailLines) {
      const h = doc.heightOfString(line, { width: descW });
      doc.text(line, descX, detailY, { width: descW });
      detailY += h + 2;
    }

    const descBlockH = Math.max(detailLines.length ? detailY - rowTop : titleH, 14);

    doc.font("Helvetica").fontSize(9).fillColor(INK);
    doc.text(formatEuroFromCents(item.netCents, invoice.currency), netX, rowTop, {
      width: 60,
      align: "right",
    });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(taxPct, taxX, rowTop, { width: 50, align: "right" });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(INK)
      .text(formatEuroFromCents(item.grossCents, invoice.currency), grossX, rowTop, {
        width: 70,
        align: "right",
      });
    y = rowTop + descBlockH + 10;
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

/**
 * Always regenerate invoice PDF from DB records (deterministic).
 * Does not read or write `pdf_data` blobs — saves storage; same invoice
 * number/amounts every time from invoice + line items + org snapshots.
 */
export async function getOrCreateInvoicePdf(
  invoiceId: string,
): Promise<{ buffer: Buffer; invoiceNumber: string; filename: string }> {
  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true },
  });
  if (!existing) throw new Error("INVOICE_NOT_FOUND");
  return renderInvoicePdf(invoiceId);
}
