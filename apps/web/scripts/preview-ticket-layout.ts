/**
 * Offline layout check: canonical ticket HTML → Chromium A4 PDF (no DB).
 *   npx tsx scripts/preview-ticket-layout.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { TICKET_BODY_ASPECT, TICKET_COL_COVER, TICKET_COL_QR } from "../src/lib/commerce/ticket-presentation";
import { buildTicketHtmlDocument } from "../src/lib/commerce/ticket-document";
import type { TicketPresentation } from "../src/lib/commerce/ticket-presentation";
import { htmlToPdfBuffer } from "../src/lib/commerce/ticket-pdf";
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
  sponsorLogoAboveScale: 1,
  sponsorLogoBelowUrl: null,
  sponsorLogoBelowAbsoluteUrl: null,
  sponsorLogoBelowScale: 1,
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
  const html = buildTicketHtmlDocument(mock, qr, { absoluteAssets: true });
  writeFileSync(path.join(outDir, "layout-check.html"), html);

  const pdf = await htmlToPdfBuffer(html);
  writeFileSync(path.join(outDir, "layout-check.pdf"), pdf);
  console.log(`Wrote ${path.join(outDir, "layout-check.pdf")} (${pdf.length} bytes)`);
  console.log(`Wrote ${path.join(outDir, "layout-check.html")}`);

  if (html.includes(mock.organizerAddress)) {
    console.error("FAIL: organizer address leaked into ticket HTML");
    process.exit(1);
  }
  if (Math.abs(ratio - TICKET_BODY_ASPECT) > 0.01) {
    console.error(`FAIL: aspect ratio not ≈ ${TICKET_BODY_ASPECT}`);
    process.exit(1);
  }
  console.log(
    `OK: Chromium PDF from canonical HTML; ticket body aspect ≈ ${TICKET_BODY_ASPECT}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
