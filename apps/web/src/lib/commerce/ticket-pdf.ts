import PDFDocument from "pdfkit";
import { existsSync, readFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { qrDataUrl } from "@/lib/qr-server";
import {
  loadTicketPresentation,
  parseSeatHighlight,
  TF_GOLD,
  TF_INK,
  TF_LINE,
  TF_MUTED,
  TF_NAVY,
  TF_PRINT_HINT,
  TF_QR_HINT,
  TF_SOFT,
  TF_TEAL,
  TICKET_BODY_ASPECT,
  TICKET_COL_COVER,
  TICKET_COL_QR,
  TICKET_QR_MIN_PX,
  TICKET_SPONSOR_LOGO_MAX_H_PX,
  TF_TAGLINE,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation";

/** ~12 mm printer-safe margin on DIN A4 */
const PAGE_MARGIN = 34;

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

async function drawImageContainWithBlur(
  doc: PDFKit.PDFDocument,
  buffer: Buffer,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // Slightly larger inset so the sharp art fills more of the cover zone
  const inset = Math.max(4, Math.round(Math.min(w, h) * 0.04));
  const ix = x + inset;
  const iy = y + inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;

  doc.rect(x, y, w, h).fill(TF_NAVY);

  try {
    const meta = await sharp(buffer).metadata();
    const srcW = meta.width || iw;
    const srcH = meta.height || ih;

    // Soft blurred backdrop — larger overscan + stronger blur, lighter navy wash
    try {
      const blurScale = Math.max(w / srcW, h / srcH) * 1.35;
      const bw = Math.max(1, Math.round(srcW * blurScale));
      const bh = Math.max(1, Math.round(srcH * blurScale));
      const blurred = await sharp(buffer)
        .resize(bw, bh, { fit: "cover" })
        .blur(28)
        .modulate({ brightness: 0.72, saturation: 1.05 })
        .png()
        .toBuffer();
      doc.save();
      doc.rect(x, y, w, h).clip();
      doc.image(blurred, x + (w - bw) / 2, y + (h - bh) / 2, {
        width: bw,
        height: bh,
      });
      doc.restore();
      doc.rect(x, y, w, h).fillOpacity(0.38).fill(TF_NAVY);
      doc.fillOpacity(1);
    } catch {
      /* navy fill already applied */
    }

    // Sharp square-safe contain — no rectangular frame/box
    const containScale = Math.min(iw / srcW, ih / srcH);
    const dw = srcW * containScale;
    const dh = srcH * containScale;
    const dx = ix + (iw - dw) / 2;
    const dy = iy + (ih - dh) / 2;

    doc.save();
    doc.rect(x, y, w, h).clip();
    doc.image(buffer, dx, dy, { width: dw, height: dh });
    doc.restore();
  } catch {
    doc.rect(x, y, w, h).fill(TF_NAVY);
  }
}

function drawCoverFallback(
  doc: PDFKit.PDFDocument,
  logo: Buffer | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const grad = doc.linearGradient(x, y, x + w, y + h);
  grad.stop(0, "#0F2747").stop(0.5, "#163A5F").stop(1, "#0B1C33");
  doc.rect(x, y, w, h).fill(grad);

  if (logo) {
    try {
      const plateW = Math.min(w - 24, 118);
      const plateH = 28;
      const px = x + (w - plateW) / 2;
      const py = y + h / 2 - 22;
      doc.roundedRect(px, py, plateW, plateH, 5).fill("#FFFFFF");
      doc.image(logo, px + 8, py + 5, {
        height: 18,
        fit: [plateW - 16, 18],
      });
    } catch {
      /* text fallback below */
    }
  }

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#FFFFFF")
    .fillOpacity(0.82)
    .text(TF_TAGLINE, x + 8, y + h / 2 + 12, {
      width: w - 16,
      align: "center",
    });
  doc.fillOpacity(1);

  const barW = 22;
  doc
    .roundedRect(x + (w - barW) / 2, y + h / 2 + 26, barW, 2, 1)
    .fill(TF_TEAL);
}

async function drawTicketPage(
  doc: PDFKit.PDFDocument,
  data: TicketPresentation,
  qr: string | null,
  cover: Buffer | null,
  logo: Buffer | null,
  options?: DrawOptions & {
    sponsorAbove?: Buffer | null;
    sponsorBelow?: Buffer | null;
  },
) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = PAGE_MARGIN;
  const accent = data.isVip ? TF_GOLD : TF_TEAL;
  const admitLabel =
    options?.pageIndexLabel ?? (data.isVip ? "VIP-TICKET" : "EINLASSTICKET");
  const seat = parseSeatHighlight(data.placeDisplayLabel, data.hasAssignedSeat);
  const sponsorAbove = options?.sponsorAbove ?? null;
  const sponsorBelow = options?.sponsorBelow ?? null;
  const hasSponsor = Boolean(sponsorAbove || sponsorBelow);

  doc.rect(0, 0, pageW, pageH).fill("#FFFFFF");

  // Landscape ticket strip ~2:1 — never stretch to A4 height
  const ticketW = pageW - margin * 2;
  const ticketH = ticketW / TICKET_BODY_ASPECT;
  const ticketX = margin;
  // Center strip on page (slight bias up for notes below)
  const notesReserve = 72;
  const ticketY = Math.max(
    margin,
    (pageH - ticketH - notesReserve) / 2,
  );

  const zoneA = Math.round(ticketW * TICKET_COL_COVER);
  const zoneC = Math.round(ticketW * TICKET_COL_QR);
  const zoneB = ticketW - zoneA - zoneC;

  doc.save();
  doc.roundedRect(ticketX, ticketY, ticketW, ticketH, 8).clip();

  // ── Zone A: cover ────────────────────────────────────────────────
  const ax = ticketX;
  if (cover) {
    await drawImageContainWithBlur(doc, cover, ax, ticketY, zoneA, ticketH);
  } else {
    drawCoverFallback(doc, logo, ax, ticketY, zoneA, ticketH);
  }

  // ── Zone B: info ─────────────────────────────────────────────────
  const bx = ticketX + zoneA;
  doc.rect(bx, ticketY, zoneB, ticketH).fill("#FFFFFF");

  const bPadX = 12;
  const bPadY = 8;
  const bInnerW = zoneB - bPadX * 2;
  let by = ticketY + bPadY;

  // Brand lockup only (no claim / tagline on the ticket middle)
  if (logo) {
    try {
      doc.image(logo, bx + bPadX, by, { height: 22, fit: [118, 22] });
    } catch {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(TF_NAVY)
        .text("Ticketfeeling", bx + bPadX, by + 4, {
          width: bInnerW,
        });
    }
  } else {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(TF_NAVY)
      .text("Ticketfeeling", bx + bPadX, by + 4, {
        width: bInnerW,
      });
  }
  by += 26;

  doc
    .fillColor(TF_NAVY)
    .font("Helvetica-Bold")
    .fontSize(13.5)
    .text(data.eventName, bx + bPadX, by, {
      width: bInnerW,
      height: 30,
      ellipsis: true,
      lineGap: 0.5,
    });
  by = Math.min(doc.y + 1, ticketY + bPadY + 52);

  if (data.dateLabel) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(TF_NAVY)
      .text(data.dateLabel, bx + bPadX, by, {
        width: bInnerW,
        height: 11,
        ellipsis: true,
      });
    by = doc.y + 1;
  }

  // Location: name + city/address
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(TF_NAVY)
    .text(data.locationName, bx + bPadX, by, {
      width: bInnerW,
      height: 11,
      ellipsis: true,
    });
  by = doc.y + 0.5;
  if (data.locationDetail) {
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(TF_MUTED)
      .text(data.locationDetail, bx + bPadX, by, {
        width: bInnerW,
        height: 9,
        ellipsis: true,
      });
    by = doc.y + 2;
  } else {
    by += 2;
  }

  // EINLASS | BEGINN side by side
  if (data.doors.headline || data.startLabel) {
    const colW = (bInnerW - 8) / 2;
    doc
      .moveTo(bx + bPadX, by)
      .lineTo(bx + bPadX + bInnerW, by)
      .strokeColor(TF_LINE)
      .lineWidth(0.6)
      .stroke();
    by += 3;

    const doorsColor =
      data.isVip || data.doors.isCategoryOverride ? accent : TF_NAVY;
    doc
      .font("Helvetica")
      .fontSize(6)
      .fillColor(TF_MUTED)
      .text((data.doors.headlineLabel || "Einlass").toUpperCase(), bx + bPadX, by, {
        width: colW,
        characterSpacing: 0.6,
      });
    doc
      .font("Helvetica")
      .fontSize(6)
      .fillColor(TF_MUTED)
      .text("BEGINN", bx + bPadX + colW + 8, by, {
        width: colW,
        characterSpacing: 0.6,
      });
    by += 8;

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(data.doors.timeLabel ? doorsColor : TF_MUTED)
      .text(
        data.doors.timeLabel ? `${data.doors.timeLabel} Uhr` : "—",
        bx + bPadX,
        by,
        { width: colW, height: 12, ellipsis: true },
      );
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(TF_NAVY)
      .text(data.startLabel ?? "—", bx + bPadX + colW + 8, by, {
        width: colW,
        height: 12,
        ellipsis: true,
      });
    by += 12;
    if (data.doors.doorsNote) {
      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor(TF_MUTED)
        .text(data.doors.doorsNote, bx + bPadX, by, {
          width: bInnerW,
          height: 9,
          ellipsis: true,
        });
      by = doc.y + 1;
    }
    doc
      .moveTo(bx + bPadX, by)
      .lineTo(bx + bPadX + bInnerW, by)
      .strokeColor(TF_LINE)
      .lineWidth(0.6)
      .stroke();
    by += 3;
  }

  // Category (VIP gold accent only)
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(TF_MUTED)
    .text("Kategorie  ", bx + bPadX, by, { continued: true });
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(data.isVip ? TF_GOLD : TF_NAVY)
    .text(data.categoryName, { continued: false });
  by = doc.y + 3;

  // Seat highlight boxes / text
  if (seat.mode === "boxes" && seat.parts.length > 0) {
    const gap = 5;
    const n = seat.parts.length;
    const boxW = (bInnerW - gap * (n - 1)) / n;
    const boxH = 24;
    for (let i = 0; i < n; i += 1) {
      const part = seat.parts[i]!;
      const ox = bx + bPadX + i * (boxW + gap);
      doc.roundedRect(ox, by, boxW, boxH, 4).fill(TF_SOFT);
      doc
        .roundedRect(ox, by, boxW, boxH, 4)
        .strokeColor(TF_LINE)
        .lineWidth(0.7)
        .stroke();
      if (part.label) {
        doc
          .font("Helvetica")
          .fontSize(6)
          .fillColor(TF_MUTED)
          .text(part.label, ox + 2, by + 2, {
            width: boxW - 4,
            align: "center",
          });
      }
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(TF_NAVY)
        .text(part.value, ox + 2, by + (part.label ? 11 : 6), {
          width: boxW - 4,
          align: "center",
          height: 12,
          ellipsis: true,
        });
    }
    by += boxH + 3;
  } else {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(TF_NAVY)
      .text(seat.text, bx + bPadX, by, {
        width: bInnerW,
        height: 13,
        ellipsis: true,
      });
    by = doc.y + 3;
  }

  const footerMeta: { label: string; value: string }[] = [
    data.holderName ? { label: "Inhaber", value: data.holderName } : null,
    data.priceLabel ? { label: "Preis", value: data.priceLabel } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  // Inhaber | Preis follow seat in the info flow (no bottom pin / dead gap)
  for (const row of footerMeta) {
    if (by > ticketY + ticketH - 10) break;
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(TF_MUTED)
      .text(`${row.label}  `, bx + bPadX, by, { continued: true });
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(TF_INK)
      .text(row.value, { continued: false });
    by = doc.y + 1;
  }

  // ── Zone C: QR stub ──────────────────────────────────────────────
  const cx = ticketX + zoneA + zoneB;
  doc.rect(cx, ticketY, zoneC, ticketH).fill(TF_SOFT);

  doc
    .moveTo(cx, ticketY + 12)
    .lineTo(cx, ticketY + ticketH - 12)
    .strokeColor(TF_LINE)
    .lineWidth(0.8)
    .dash(3, { space: 3 })
    .stroke()
    .undash();

  const cPad = 8;
  const cInnerW = zoneC - cPad * 2;
  let cy = ticketY + 6;
  const sponsorH = Math.min(16, TICKET_SPONSOR_LOGO_MAX_H_PX);
  const sponsorReserve =
    (sponsorAbove ? sponsorH + 3 : 0) + (sponsorBelow ? sponsorH + 3 : 0);

  if (sponsorAbove) {
    try {
      doc.image(sponsorAbove, cx + cPad, cy, {
        fit: [cInnerW, sponsorH],
        align: "center",
        valign: "center",
      });
    } catch {
      /* skip broken sponsor asset */
    }
    cy += sponsorH + 3;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(accent)
    .text(admitLabel, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
      characterSpacing: 1.1,
    });
  cy = doc.y + 3;

  const qrMax = Math.min(
    cInnerW - 2,
    ticketH - 58 - sponsorReserve,
    hasSponsor ? Math.max(TICKET_QR_MIN_PX, 118) : 128,
  );
  const quiet = 5;
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
  cy += qrPlate + 3;

  doc
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .fillColor(TF_NAVY)
    .text(data.ticketNumber, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
      height: 10,
      ellipsis: true,
    });
  cy = doc.y + 1;

  doc
    .font("Helvetica")
    .fontSize(6.5)
    .fillColor(TF_MUTED)
    .text(TF_QR_HINT, cx + cPad, cy, {
      width: cInnerW,
      align: "center",
    });
  cy = doc.y + 2;

  if (sponsorBelow) {
    try {
      doc.image(sponsorBelow, cx + cPad, cy, {
        fit: [cInnerW, sponsorH],
        align: "center",
        valign: "center",
      });
    } catch {
      /* skip broken sponsor asset */
    }
  }

  doc.restore(); // end clip

  // Ticket notches on perforation (after clip — punch into white page)
  const notchR = 6;
  doc.circle(cx, ticketY, notchR).fill("#FFFFFF");
  doc.circle(cx, ticketY + ticketH, notchR).fill("#FFFFFF");

  // Outer stroke + accent edge
  doc
    .roundedRect(ticketX, ticketY, ticketW, ticketH, 8)
    .strokeColor(TF_LINE)
    .lineWidth(1.25)
    .stroke();
  doc.rect(ticketX, ticketY, ticketW, 3).fill(accent);

  // Notes below strip (organizer name only — never street address)
  let notesY = ticketY + ticketH + 22;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(TF_MUTED)
    .text(TF_PRINT_HINT, margin, notesY, {
      width: ticketW,
      align: "left",
    });
  notesY = doc.y + 8;

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
  const sponsorAbove = await loadCoverBuffer(
    data.sponsorLogoAboveUrl ?? data.sponsorLogoAboveAbsoluteUrl,
  );
  const sponsorBelow = await loadCoverBuffer(
    data.sponsorLogoBelowUrl ?? data.sponsorLogoBelowAbsoluteUrl,
  );
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

  await drawTicketPage(doc, data, qr, cover, logo, {
    sponsorAbove,
    sponsorBelow,
  });
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
      const sponsorAbove = await loadCoverBuffer(
        data.sponsorLogoAboveUrl ?? data.sponsorLogoAboveAbsoluteUrl,
      );
      const sponsorBelow = await loadCoverBuffer(
        data.sponsorLogoBelowUrl ?? data.sponsorLogoBelowAbsoluteUrl,
      );
      return { data, qr, cover, sponsorAbove, sponsorBelow };
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
    const { data, qr, cover, sponsorAbove, sponsorBelow } = presentations[i]!;
    if (i > 0) doc.addPage({ size: "A4", margin: 0 });
    await drawTicketPage(doc, data, qr, cover, logo, {
      pageIndexLabel:
        presentations.length > 1
          ? `${data.isVip ? "VIP-TICKET" : "EINLASSTICKET"}  ${i + 1}/${presentations.length}`
          : null,
      sponsorAbove,
      sponsorBelow,
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
