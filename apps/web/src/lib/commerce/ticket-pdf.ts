import PDFDocument from "pdfkit";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { qrDataUrl } from "@/lib/qr-server";
import {
  loadTicketPresentation,
  TF_GOLD,
  TF_INK,
  TF_LINE,
  TF_MUTED,
  TF_NAVY,
  TF_SOFT,
  TF_TAGLINE,
  TF_TEAL,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation";

type DrawOptions = {
  compact?: boolean;
  pageIndexLabel?: string | null;
};

async function loadCoverBuffer(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) {
      const base64 = url.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
      return Buffer.from(base64, "base64");
    }
    if (url.startsWith("/") || !/^https?:\/\//i.test(url)) {
      const rel = url.replace(/^\//, "").split("?")[0]!;
      const candidates = [
        path.join(process.cwd(), "public", rel),
        path.join(process.cwd(), "apps/web/public", rel),
      ];
      for (const file of candidates) {
        if (existsSync(file)) return readFileSync(file);
      }
      return null;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

function drawTicketPage(
  doc: PDFKit.PDFDocument,
  data: TicketPresentation,
  qr: string | null,
  cover: Buffer | null,
  options?: DrawOptions,
) {
  const compact = options?.compact === true;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const pad = compact ? 24 : 40;
  const contentW = pageW - pad * 2;
  const accent = data.isVip ? TF_GOLD : TF_TEAL;

  doc.rect(0, 0, pageW, pageH).fill("#FFFFFF");

  const headerH = compact ? 44 : 56;
  doc.rect(0, 0, pageW, headerH).fill(TF_NAVY);
  doc.rect(0, headerH, pageW, 3).fill(accent);

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(compact ? 10 : 12)
    .text("TICKETFEELING", pad, compact ? 12 : 16, {
      characterSpacing: 2,
      width: contentW * 0.55,
    });

  doc
    .fillColor(accent)
    .font("Helvetica-Bold")
    .fontSize(compact ? 8 : 9)
    .text(
      options?.pageIndexLabel ?? (data.isVip ? "VIP-TICKET" : "EINLASSTICKET"),
      pad,
      compact ? 16 : 20,
      { width: contentW, align: "right" },
    );

  let y = headerH + (compact ? 14 : 20);

  // Square cover — strong visual, capped for page fit
  if (cover) {
    const maxCover = Math.min(contentW, compact ? 160 : 220);
    const coverX = (pageW - maxCover) / 2;
    doc.rect(coverX, y, maxCover, maxCover).fill(TF_NAVY);
    try {
      doc.image(cover, coverX, y, {
        fit: [maxCover, maxCover],
        align: "center",
        valign: "center",
      });
    } catch {
      /* skip broken image */
    }
    y += maxCover + (compact ? 10 : 14);
  }

  doc
    .fillColor(TF_NAVY)
    .font("Helvetica-Bold")
    .fontSize(compact ? 16 : 22)
    .text(data.eventName, pad, y, { width: contentW, align: "center" });
  y = doc.y + (compact ? 4 : 6);

  if (data.dateLabel) {
    doc
      .font("Helvetica")
      .fontSize(compact ? 10 : 12)
      .fillColor(TF_NAVY)
      .text(data.dateLabel, pad, y, { width: contentW, align: "center" });
    y = doc.y + (compact ? 8 : 10);
  }

  if (data.doors.headline) {
    const doorsText = `${data.doors.headline}${data.doors.timeLabel ? " Uhr" : ""}`;
    doc
      .font("Helvetica-Bold")
      .fontSize(compact ? 13 : 17)
      .fillColor(data.isVip ? TF_GOLD : TF_NAVY)
      .text(doorsText, pad, y, { width: contentW, align: "center" });
    y = doc.y + 2;
    if (data.doors.doorsNote) {
      doc
        .font("Helvetica")
        .fontSize(compact ? 8 : 9)
        .fillColor(TF_MUTED)
        .text(data.doors.doorsNote, pad, y, { width: contentW, align: "center" });
      y = doc.y + (compact ? 8 : 10);
    } else {
      y += compact ? 8 : 10;
    }
  }

  const meta = [
    data.startLabel ? { label: "Beginn", value: data.startLabel } : null,
    { label: "Location", value: data.locationShort },
    { label: "Kategorie", value: data.categoryName },
    { label: "Platz", value: data.placeLabel },
    data.priceLabel ? { label: "Preis", value: data.priceLabel } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const labelW = compact ? 70 : 84;
  const metaX = pad + (compact ? 8 : 24);
  const metaW = contentW - (compact ? 16 : 48);
  for (const row of meta) {
    doc
      .font("Helvetica")
      .fontSize(compact ? 8 : 9)
      .fillColor(TF_MUTED)
      .text(row.label, metaX, y, { width: labelW });
    doc
      .font("Helvetica-Bold")
      .fontSize(compact ? 9 : 10)
      .fillColor(
        row.label === "Kategorie" && data.isVip ? TF_GOLD : TF_INK,
      )
      .text(row.value, metaX + labelW, y, { width: metaW - labelW });
    y = Math.max(doc.y, y + (compact ? 13 : 15));
  }

  y += compact ? 8 : 12;

  // Soft QR plate
  const qrDraw = compact ? 140 : 180;
  const platePad = compact ? 12 : 16;
  const plateH = qrDraw + platePad * 2 + (compact ? 36 : 44);
  const plateY = y;
  doc
    .roundedRect(pad, plateY, contentW, plateH, 10)
    .fill(TF_SOFT);
  doc
    .roundedRect(pad, plateY, contentW, plateH, 10)
    .strokeColor(TF_LINE)
    .lineWidth(1)
    .stroke();

  let qrY = plateY + platePad;
  doc
    .font("Helvetica-Bold")
    .fontSize(compact ? 8 : 9)
    .fillColor(accent)
    .text("QR-CODE ZUM EINLASS", pad, qrY, { width: contentW, align: "center" });
  qrY = doc.y + (compact ? 6 : 8);

  if (qr) {
    try {
      const img = Buffer.from(qr.replace(/^data:image\/png;base64,/, ""), "base64");
      doc.image(img, (pageW - qrDraw) / 2, qrY, { width: qrDraw, height: qrDraw });
      qrY += qrDraw + (compact ? 6 : 8);
    } catch {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#B91C1C")
        .text("Kein gültiger QR-Code", pad, qrY, { width: contentW, align: "center" });
      qrY = doc.y + 8;
    }
  } else {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#B91C1C")
      .text("Kein gültiger QR-Code", pad, qrY, { width: contentW, align: "center" });
    qrY = doc.y + 8;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(compact ? 11 : 12)
    .fillColor(TF_NAVY)
    .text(data.ticketNumber, pad, qrY, { width: contentW, align: "center" });

  y = plateY + plateH + (compact ? 10 : 14);

  const footerTop = Math.min(y, pageH - (compact ? 52 : 64));
  doc
    .moveTo(pad, footerTop)
    .lineTo(pad + contentW, footerTop)
    .strokeColor(TF_LINE)
    .lineWidth(1)
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(compact ? 7 : 8)
    .fillColor(TF_NAVY)
    .text(`Veranstalter: ${data.organizerDisplayName}`, pad, footerTop + 8, {
      width: contentW,
      align: "center",
    });
  if (data.organizerAddress) {
    doc
      .font("Helvetica")
      .fontSize(compact ? 7 : 8)
      .fillColor(TF_MUTED)
      .text(data.organizerAddress, pad, doc.y + 1, {
        width: contentW,
        align: "center",
      });
  }
  doc
    .font("Helvetica")
    .fontSize(compact ? 6 : 7)
    .fillColor(TF_MUTED)
    .text(TF_TAGLINE, pad, pageH - (compact ? 16 : 18), {
      width: contentW,
      align: "center",
    });
}

export async function renderTicketPdf(
  ticketId: string,
  options?: { compact?: boolean },
): Promise<{
  buffer: Buffer;
  ticketNumber: string;
  filename: string;
}> {
  const compact = options?.compact === true;
  const data = await loadTicketPresentation(ticketId);
  const qrPx = compact ? 220 : 280;
  const qr = data.qrToken ? await qrDataUrl(data.qrToken, qrPx) : null;
  const cover = await loadCoverBuffer(data.coverUrl ?? data.coverAbsoluteUrl);

  const doc = new PDFDocument({
    size: compact ? "A5" : "A4",
    margin: 0,
    compress: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawTicketPage(doc, data, qr, cover, { compact });
  doc.end();
  const buffer = await done;
  return {
    buffer,
    ticketNumber: data.ticketNumber,
    filename: `${data.ticketNumber}.pdf`,
  };
}

/** One multi-page PDF for all tickets of an order (e-mail attachment / box office). */
export async function renderOrderTicketsPdf(orderId: string): Promise<{
  buffer: Buffer;
  filename: string;
  ticketCount: number;
}> {
  const tickets = await prisma.ticket.findMany({
    where: { orderId },
    orderBy: { ticketNumber: "asc" },
    select: { id: true, ticketNumber: true, order: { select: { orderNumber: true } } },
  });
  if (tickets.length === 0) throw new Error("NO_TICKETS");

  if (tickets.length === 1) {
    const single = await renderTicketPdf(tickets[0]!.id, { compact: true });
    return {
      buffer: single.buffer,
      filename: `${tickets[0]!.order.orderNumber}-tickets.pdf`,
      ticketCount: 1,
    };
  }

  const presentations = await Promise.all(
    tickets.map(async (t) => {
      const data = await loadTicketPresentation(t.id);
      const qr = data.qrToken ? await qrDataUrl(data.qrToken, 220) : null;
      const cover = await loadCoverBuffer(data.coverUrl ?? data.coverAbsoluteUrl);
      return { data, qr, cover };
    }),
  );

  const doc = new PDFDocument({ size: "A5", margin: 0, compress: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  for (let i = 0; i < presentations.length; i += 1) {
    const { data, qr, cover } = presentations[i]!;
    if (i > 0) doc.addPage({ size: "A5", margin: 0 });
    drawTicketPage(doc, data, qr, cover, {
      compact: true,
      pageIndexLabel: `TICKET ${i + 1}/${presentations.length}`,
    });
  }

  doc.end();
  const buffer = await done;
  const orderNumber = tickets[0]!.order.orderNumber;
  return {
    buffer,
    filename: `${orderNumber}-tickets.pdf`,
    ticketCount: presentations.length,
  };
}
