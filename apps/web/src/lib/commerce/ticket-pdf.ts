import PDFDocument from "pdfkit";
import { existsSync, readFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { qrDataUrl } from "@/lib/qr-server";
import {
  loadTicketPresentation,
  TF_GOLD,
  TF_INK,
  TF_LINE,
  TF_MUTED,
  TF_NAVY,
  TF_PRINT_HINT,
  TF_QR_HINT,
  TF_SOFT,
  TF_TAGLINE,
  TF_TEAL,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation";

/** ~12 mm printer-safe margin on DIN A4 */
const PAGE_MARGIN = 34;
/** Landscape ticket strip aspect (~1.7:1, near A5 landscape) */
const TICKET_ASPECT = 1.72;

type DrawOptions = {
  pageIndexLabel?: string | null;
};

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

async function drawImageCover(
  doc: PDFKit.PDFDocument,
  buffer: Buffer,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  try {
    const meta = await sharp(buffer).metadata();
    const iw = meta.width || w;
    const ih = meta.height || h;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    doc.save();
    doc.rect(x, y, w, h).clip();
    doc.image(buffer, dx, dy, { width: dw, height: dh });
    doc.restore();
  } catch {
    doc.rect(x, y, w, h).fill(TF_NAVY);
  }
}

async function drawTicketPage(
  doc: PDFKit.PDFDocument,
  data: TicketPresentation,
  qr: string | null,
  cover: Buffer | null,
  logo: Buffer | null,
  options?: DrawOptions,
) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = PAGE_MARGIN;
  const accent = data.isVip ? TF_GOLD : TF_TEAL;
  const admitLabel =
    options?.pageIndexLabel ?? (data.isVip ? "VIP-TICKET" : "EINLASSTICKET");

  doc.rect(0, 0, pageW, pageH).fill("#FFFFFF");

  const ticketW = pageW - margin * 2;
  const ticketH = Math.min(Math.round(ticketW / TICKET_ASPECT), 318);
  const ticketX = margin;
  const ticketY = margin;

  // Ticket outer frame
  doc.save();
  doc.roundedRect(ticketX, ticketY, ticketW, ticketH, 8).clip();

  const zoneA = Math.round(ticketW * 0.3);
  const zoneC = Math.round(ticketW * 0.27);
  const zoneB = ticketW - zoneA - zoneC;

  // ── Zone A: emotional cover ──────────────────────────────────────
  const ax = ticketX;
  doc.rect(ax, ticketY, zoneA, ticketH).fill(TF_NAVY);
  if (cover) {
    await drawImageCover(doc, cover, ax, ticketY, zoneA, ticketH);
    // Soft right-edge vignette toward the info zone
    doc.save();
    doc.rect(ax, ticketY, zoneA, ticketH).clip();
    const grad = doc.linearGradient(ax + zoneA * 0.5, ticketY, ax + zoneA, ticketY);
    grad.stop(0, TF_NAVY, 0).stop(1, TF_NAVY, 0.28);
    doc.rect(ax, ticketY, zoneA, ticketH).fill(grad);
    doc.restore();
  } else {
    // Dark logo is unreadable on navy — wordmark fallback only
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("TICKETFEELING", ax + 12, ticketY + ticketH / 2 - 14, {
        width: zoneA - 24,
        align: "center",
        characterSpacing: 1.5,
      });
    doc
      .fillColor("#FFFFFF")
      .fillOpacity(0.72)
      .font("Helvetica")
      .fontSize(7)
      .text(TF_TAGLINE, ax + 12, ticketY + ticketH / 2 + 4, {
        width: zoneA - 24,
        align: "center",
      });
    doc.fillOpacity(1);
  }

  // ── Zone B: info ─────────────────────────────────────────────────
  const bx = ticketX + zoneA;
  doc.rect(bx, ticketY, zoneB, ticketH).fill("#FFFFFF");

  const bPadX = 16;
  const bPadY = 14;
  const bInnerW = zoneB - bPadX * 2;
  let by = ticketY + bPadY;

  doc
    .fillColor(TF_NAVY)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(data.eventName, bx + bPadX, by, {
      width: bInnerW,
      height: 40,
      ellipsis: true,
      lineGap: 1,
    });
  by = Math.min(doc.y + 4, ticketY + bPadY + 44);

  if (data.dateLabel) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(TF_NAVY)
      .text(data.dateLabel, bx + bPadX, by, {
        width: bInnerW,
        height: 14,
        ellipsis: true,
      });
    by = doc.y + 6;
  }

  if (data.doors.headline) {
    const doorsText = `${data.doors.headline}${data.doors.timeLabel ? " Uhr" : ""}`;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(data.isVip || data.doors.isCategoryOverride ? accent : TF_NAVY)
      .text(doorsText, bx + bPadX, by, {
        width: bInnerW,
        height: 16,
        ellipsis: true,
      });
    by = doc.y + 2;
    if (data.doors.doorsNote) {
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(TF_MUTED)
        .text(data.doors.doorsNote, bx + bPadX, by, {
          width: bInnerW,
          height: 12,
          ellipsis: true,
        });
      by = doc.y + 6;
    } else {
      by += 6;
    }
  }

  const meta: { label: string; value: string; accent?: boolean }[] = [
    data.startLabel ? { label: "Beginn", value: data.startLabel } : null,
    { label: "Location", value: data.locationTicket },
    {
      label: "Kategorie",
      value: data.categoryName,
      accent: data.isVip,
    },
  ].filter(Boolean) as { label: string; value: string; accent?: boolean }[];

  const labelCol = 58;
  for (const row of meta) {
    if (by > ticketY + ticketH - 78) break;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(TF_MUTED)
      .text(row.label, bx + bPadX, by, { width: labelCol });
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(row.accent ? TF_GOLD : TF_INK)
      .text(row.value, bx + bPadX + labelCol, by, {
        width: bInnerW - labelCol,
        height: 12,
        ellipsis: true,
      });
    by += 13;
  }

  // Prominent seat line
  by += 4;
  doc
    .font("Helvetica-Bold")
    .fontSize(data.hasAssignedSeat ? 11 : 10)
    .fillColor(TF_NAVY)
    .text(data.placeDisplayLabel, bx + bPadX, by, {
      width: bInnerW,
      height: 16,
      ellipsis: true,
    });
  by = doc.y + 6;

  const footerMeta: { label: string; value: string }[] = [
    data.holderName ? { label: "Inhaber", value: data.holderName } : null,
    data.priceLabel ? { label: "Preis", value: data.priceLabel } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  for (const row of footerMeta) {
    if (by > ticketY + ticketH - 36) break;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(TF_MUTED)
      .text(row.label, bx + bPadX, by, { width: labelCol });
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(TF_INK)
      .text(row.value, bx + bPadX + labelCol, by, {
        width: bInnerW - labelCol,
        height: 12,
        ellipsis: true,
      });
    by += 12;
  }

  // Discrete TF mark at bottom of info zone
  const brandY = ticketY + ticketH - 22;
  if (logo) {
    try {
      doc.image(logo, bx + bPadX, brandY - 2, { height: 14, fit: [72, 14] });
      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor(TF_MUTED)
        .text(TF_TAGLINE, bx + bPadX + 78, brandY + 2, {
          width: bInnerW - 78,
          height: 10,
          ellipsis: true,
        });
    } catch {
      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor(TF_MUTED)
        .text(`Ticketfeeling · ${TF_TAGLINE}`, bx + bPadX, brandY + 2, {
          width: bInnerW,
        });
    }
  } else {
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .fillColor(TF_MUTED)
      .text(`Ticketfeeling · ${TF_TAGLINE}`, bx + bPadX, brandY + 2, {
        width: bInnerW,
      });
  }

  // ── Zone C: QR panel ─────────────────────────────────────────────
  const cx = ticketX + zoneA + zoneB;
  doc.rect(cx, ticketY, zoneC, ticketH).fill(TF_SOFT);

  // Perforation hint between B and C
  doc
    .moveTo(cx, ticketY + 10)
    .lineTo(cx, ticketY + ticketH - 10)
    .strokeColor(TF_LINE)
    .lineWidth(0.8)
    .dash(3, { space: 3 })
    .stroke()
    .undash();

  const cPad = 12;
  const cInnerW = zoneC - cPad * 2;
  let cy = ticketY + 12;

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(accent)
    .text(admitLabel, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
      characterSpacing: 1.2,
    });
  cy = doc.y + 8;

  const qrMax = Math.min(cInnerW - 8, ticketH - 88, 132);
  const quiet = 8;
  const qrPlate = qrMax + quiet * 2;
  const qrPlateX = cx + (zoneC - qrPlate) / 2;

  doc.roundedRect(qrPlateX, cy, qrPlate, qrPlate, 4).fill("#FFFFFF");

  if (qr) {
    try {
      const img = Buffer.from(qr.replace(/^data:image\/png;base64,/, ""), "base64");
      doc.image(img, qrPlateX + quiet, cy + quiet, {
        width: qrMax,
        height: qrMax,
      });
    } catch {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#B91C1C")
        .text("Kein QR", cx + cPad, cy + qrPlate / 2, {
          width: cInnerW,
          align: "center",
        });
    }
  } else {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#B91C1C")
      .text("Kein gültiger QR-Code", cx + cPad, cy + qrPlate / 2, {
        width: cInnerW,
        align: "center",
      });
  }
  cy += qrPlate + 8;

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(TF_NAVY)
    .text(data.ticketNumber, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
      height: 12,
      ellipsis: true,
    });
  cy = doc.y + 4;

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(TF_MUTED)
    .text(TF_QR_HINT, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
    });

  doc.restore(); // end clip

  // Accent top edge + outer stroke (after clip restore so stroke is crisp)
  doc
    .roundedRect(ticketX, ticketY, ticketW, ticketH, 8)
    .strokeColor(TF_LINE)
    .lineWidth(1.25)
    .stroke();
  doc.rect(ticketX, ticketY, ticketW, 3).fill(accent);

  // ── Below ticket: sparse notes + white space ─────────────────────
  let notesY = ticketY + ticketH + 28;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(TF_MUTED)
    .text(TF_PRINT_HINT, margin, notesY, {
      width: ticketW,
      align: "left",
    });
  notesY = doc.y + 10;

  if (data.organizerDisplayName) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(TF_MUTED)
      .text(`Veranstalter: ${data.organizerDisplayName}`, margin, notesY, {
        width: ticketW,
        height: 12,
        ellipsis: true,
      });
  }
}

export async function renderTicketPdf(ticketId: string): Promise<{
  buffer: Buffer;
  ticketNumber: string;
  filename: string;
}> {
  const data = await loadTicketPresentation(ticketId);
  const qr = data.qrToken ? await qrDataUrl(data.qrToken, 320) : null;
  const cover = await loadCoverBuffer(data.coverUrl ?? data.coverAbsoluteUrl);
  const logo = loadLogoBuffer();

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    compress: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  await drawTicketPage(doc, data, qr, cover, logo);
  doc.end();
  const buffer = await done;
  return {
    buffer,
    ticketNumber: data.ticketNumber,
    filename: `${data.ticketNumber}.pdf`,
  };
}

/** One multi-page A4 PDF for all tickets of an order (e-mail / box office). */
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

  const presentations = await Promise.all(
    tickets.map(async (t) => {
      const data = await loadTicketPresentation(t.id);
      const qr = data.qrToken ? await qrDataUrl(data.qrToken, 320) : null;
      const cover = await loadCoverBuffer(data.coverUrl ?? data.coverAbsoluteUrl);
      return { data, qr, cover };
    }),
  );
  const logo = loadLogoBuffer();

  const doc = new PDFDocument({ size: "A4", margin: 0, compress: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  for (let i = 0; i < presentations.length; i += 1) {
    const { data, qr, cover } = presentations[i]!;
    if (i > 0) doc.addPage({ size: "A4", margin: 0 });
    await drawTicketPage(doc, data, qr, cover, logo, {
      pageIndexLabel:
        presentations.length > 1
          ? `${data.isVip ? "VIP-TICKET" : "EINLASSTICKET"}  ${i + 1}/${presentations.length}`
          : null,
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
