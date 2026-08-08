/**
 * Offline layout check: landscape ~2:1 ticket strip on A4 (no DB).
 *   npx tsx scripts/preview-ticket-layout.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
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
  parseSeatHighlight,
} from "../src/lib/commerce/ticket-presentation";
import { buildTicketHtmlDocument } from "../src/lib/commerce/ticket-document";
import type { TicketPresentation } from "../src/lib/commerce/ticket-presentation";
import { qrDataUrl } from "../src/lib/qr-server";

const mock: TicketPresentation = {
  ticketId: "preview",
  ticketNumber: "TF-T-LAYOUT-CHECK",
  eventName: "Schlagerfeeling Open Air Preview",
  dateLabel: "Samstag, 15. August 2026",
  startLabel: "20:00 Uhr",
  doors: {
    doorsOpenAt: null,
    doorsNote: null,
    isCategoryOverride: false,
    categoryName: "Kategorie 1",
    headlineLabel: "EINLASS",
    timeLabel: "18:30",
    headline: "EINLASS 18:30",
  },
  locationLines: ["Olympiahalle", "Spiridon-Louis-Ring 21", "80809 München"],
  locationShort: "Olympiahalle, München",
  locationTicket: "Olympiahalle, 80809 München",
  locationName: "Olympiahalle",
  locationDetail: "80809 München",
  categoryName: "Kategorie 1",
  categoryKind: "seated",
  isVip: false,
  placeLabel: "Block A · Reihe 1 · Platz 9",
  placeDisplayLabel: "BLOCK A · REIHE 1 · PLATZ 9",
  hasAssignedSeat: true,
  priceLabel: "79,00 €",
  coverUrl: null,
  coverAbsoluteUrl: null,
  sponsorLogoAboveUrl: null,
  sponsorLogoAboveAbsoluteUrl: null,
  sponsorLogoBelowUrl: null,
  sponsorLogoBelowAbsoluteUrl: null,
  sponsorAboveName: null,
  sponsorAboveHref: null,
  sponsorBelowName: null,
  sponsorBelowHref: null,
  organizerDisplayName: "Demo Veranstalter GmbH",
  organizerAddress: "SHOULD NOT APPEAR",
  organizerContact: null,
  holderName: "Max Muster",
  orderNumber: "TF-O-PREVIEW",
  qrToken: "preview-layout-token-not-for-scan",
};

async function main() {
  const outDir = path.join(process.cwd(), "tmp/ticket-pdf-preview");
  mkdirSync(outDir, { recursive: true });

  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 34;
  const ticketW = pageW - margin * 2;
  const ticketH = ticketW / TICKET_BODY_ASPECT;
  const ratio = ticketW / ticketH;

  console.log(
    JSON.stringify(
      {
        ticketW: Math.round(ticketW * 10) / 10,
        ticketH: Math.round(ticketH * 10) / 10,
        aspect: Math.round(ratio * 1000) / 1000,
        expectedAspect: TICKET_BODY_ASPECT,
        cols: {
          cover: Math.round(ticketW * TICKET_COL_COVER),
          info: Math.round(ticketW * (1 - TICKET_COL_COVER - TICKET_COL_QR)),
          qr: Math.round(ticketW * TICKET_COL_QR),
        },
        mmApprox: {
          w: Math.round((ticketW / 72) * 25.4),
          h: Math.round((ticketH / 72) * 25.4),
        },
      },
      null,
      2,
    ),
  );

  const qr = await qrDataUrl(mock.qrToken!, 280);
  if (!qr) throw new Error("QR generation failed");
  const html = buildTicketHtmlDocument(mock, qr);
  writeFileSync(path.join(outDir, "layout-check.html"), html);

  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const accent = TF_TEAL;
  const ticketX = margin;
  const ticketY = Math.max(margin, (pageH - ticketH - 72) / 2);
  const zoneA = Math.round(ticketW * TICKET_COL_COVER);
  const zoneC = Math.round(ticketW * TICKET_COL_QR);
  const zoneB = ticketW - zoneA - zoneC;
  const seat = parseSeatHighlight(mock.placeDisplayLabel, mock.hasAssignedSeat);

  doc.rect(0, 0, pageW, pageH).fill("#FFFFFF");
  doc.save();
  doc.roundedRect(ticketX, ticketY, ticketW, ticketH, 8).clip();

  doc.rect(ticketX, ticketY, zoneA, ticketH).fill(TF_NAVY);
  doc
    .fillColor("#fff")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("TICKETFEELING", ticketX + 12, ticketY + ticketH / 2 - 10, {
      width: zoneA - 24,
      align: "center",
    });

  const bx = ticketX + zoneA;
  doc.rect(bx, ticketY, zoneB, ticketH).fill("#fff");
  let by = ticketY + 12;
  doc
    .fillColor(TF_NAVY)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Ticketfeeling", bx + 14, by, { width: zoneB - 28 });
  by += 18;
  doc.fontSize(15).text(mock.eventName, bx + 14, by, { width: zoneB - 28, height: 34 });
  by = doc.y + 4;
  doc.font("Helvetica").fontSize(9).text(mock.dateLabel!, bx + 14, by);
  by = doc.y + 4;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(accent).text(mock.doors.headline!, bx + 14, by);
  by = doc.y + 8;
  for (const [label, value] of [
    ["Beginn", mock.startLabel!],
    ["Location", mock.locationTicket],
    ["Kategorie", mock.categoryName],
  ] as const) {
    doc.font("Helvetica").fontSize(7).fillColor(TF_MUTED).text(label, bx + 14, by, { width: 52 });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(TF_INK).text(value, bx + 66, by, {
      width: zoneB - 80,
    });
    by += 12;
  }
  by += 4;
  const gap = 5;
  const boxW = (zoneB - 28 - gap * 2) / 3;
  for (let i = 0; i < seat.parts.length; i++) {
    const p = seat.parts[i]!;
    const ox = bx + 14 + i * (boxW + gap);
    doc.roundedRect(ox, by, boxW, 28, 4).fill(TF_SOFT);
    doc.roundedRect(ox, by, boxW, 28, 4).strokeColor(TF_LINE).lineWidth(0.7).stroke();
    doc.font("Helvetica").fontSize(6).fillColor(TF_MUTED).text(p.label, ox + 2, by + 4, {
      width: boxW - 4,
      align: "center",
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(TF_NAVY)
      .text(p.value, ox + 2, by + 13, { width: boxW - 4, align: "center" });
  }

  const cx = ticketX + zoneA + zoneB;
  doc.rect(cx, ticketY, zoneC, ticketH).fill(TF_SOFT);
  doc
    .moveTo(cx, ticketY + 12)
    .lineTo(cx, ticketY + ticketH - 12)
    .strokeColor(TF_LINE)
    .dash(3, { space: 3 })
    .stroke()
    .undash();
  let cy = ticketY + 12;
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(accent)
    .text("EINLASSTICKET", cx + 10, cy, { width: zoneC - 20, align: "center" });
  cy = doc.y + 8;
  const qrMax = 100;
  const quiet = 6;
  const plate = qrMax + quiet * 2;
  const qx = cx + (zoneC - plate) / 2;
  doc.roundedRect(qx, cy, plate, plate, 4).fill("#fff");
  const img = Buffer.from(qr.replace(/^data:image\/png;base64,/, ""), "base64");
  doc.image(img, qx + quiet, cy + quiet, { width: qrMax, height: qrMax });
  cy += plate + 8;
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(TF_NAVY)
    .text(mock.ticketNumber, cx + 10, cy, { width: zoneC - 20, align: "center" });
  doc
    .font("Helvetica")
    .fontSize(6.5)
    .fillColor(TF_MUTED)
    .text(TF_QR_HINT, cx + 10, doc.y + 3, { width: zoneC - 20, align: "center" });

  doc.restore();
  doc.circle(cx, ticketY, 6).fill("#fff");
  doc.circle(cx, ticketY + ticketH, 6).fill("#fff");
  doc.roundedRect(ticketX, ticketY, ticketW, ticketH, 8).strokeColor(TF_LINE).lineWidth(1.25).stroke();
  doc.rect(ticketX, ticketY, ticketW, 3).fill(accent);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(TF_MUTED)
    .text(TF_PRINT_HINT, margin, ticketY + ticketH + 22, { width: ticketW });
  doc.text(`Veranstalter: ${mock.organizerDisplayName}`, margin, doc.y + 8, { width: ticketW });
  // Guard: address must not appear
  void TF_GOLD;

  doc.end();
  const pdf = await done;
  writeFileSync(path.join(outDir, "layout-check.pdf"), pdf);
  console.log(`Wrote ${path.join(outDir, "layout-check.pdf")} (${pdf.length} bytes)`);
  console.log(`Wrote ${path.join(outDir, "layout-check.html")}`);
  if (Math.abs(ratio - 2) > 0.01) {
    console.error("FAIL: aspect ratio not ~2:1");
    process.exit(1);
  }
  console.log("OK: ticket body aspect ≈ 2:1");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
