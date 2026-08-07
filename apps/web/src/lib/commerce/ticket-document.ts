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
  TF_TAGLINE,
  TF_TEAL,
  TICKET_BODY_ASPECT,
  TICKET_COL_COVER,
  TICKET_COL_QR,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation";

/** Server-generated printable HTML ticket — landscape ~2:1 strip on A4. */
export async function renderTicketHtml(ticketId: string) {
  const data = await loadTicketPresentation(ticketId);
  const qr = data.qrToken ? await qrDataUrl(data.qrToken, 320) : null;
  return buildTicketHtmlDocument(data, qr);
}

export function buildTicketHtmlDocument(
  data: TicketPresentation,
  qrDataUrlOrNull: string | null,
): string {
  const accent = data.isVip ? TF_GOLD : TF_TEAL;
  const cover = data.coverAbsoluteUrl ?? data.coverUrl;
  const admitLabel = data.isVip ? "VIP-TICKET" : "EINLASSTICKET";
  const doorsColor =
    data.isVip || data.doors.isCategoryOverride ? accent : TF_NAVY;
  const seat = parseSeatHighlight(data.placeDisplayLabel, data.hasAssignedSeat);
  const coverPct = Math.round(TICKET_COL_COVER * 100);
  const qrPct = Math.round(TICKET_COL_QR * 100);
  const infoPct = 100 - coverPct - qrPct;

  const metaRows = [
    data.startLabel ? row("Beginn", data.startLabel) : "",
    row("Location", data.locationTicket),
    row("Kategorie", data.categoryName, data.isVip ? TF_GOLD : TF_NAVY),
  ]
    .filter(Boolean)
    .join("");

  const seatHtml =
    seat.mode === "boxes"
      ? `<div class="seat-boxes">${seat.parts
          .map(
            (p) => `<div class="seat-box">${
              p.label ? `<span class="seat-label">${escapeHtml(p.label)}</span>` : ""
            }<span class="seat-value">${escapeHtml(p.value)}</span></div>`,
          )
          .join("")}</div>`
      : `<p class="place">${escapeHtml(seat.text)}</p>`;

  const footerBits = [
    data.holderName
      ? `<span>Inhaber <strong>${escapeHtml(data.holderName)}</strong></span>`
      : "",
    data.priceLabel
      ? `<span>Preis <strong>${escapeHtml(data.priceLabel)}</strong></span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.ticketNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    @page { size: A4 portrait; margin: 12mm; }
    body {
      margin: 0;
      padding: 16px;
      background: #fff;
      color: ${TF_INK};
      font-family: Inter, system-ui, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      max-width: 210mm;
      margin: 0 auto;
    }
    /* Ticket BODY locked to landscape ~2:1 — independent of A4 page height */
    .ticket-scale {
      width: 100%;
      overflow-x: auto;
    }
    .ticket {
      display: grid;
      grid-template-columns: ${coverPct}% minmax(0, ${infoPct}%) ${qrPct}%;
      grid-template-rows: 1fr;
      width: min(100%, 200mm);
      aspect-ratio: ${TICKET_BODY_ASPECT} / 1;
      height: auto;
      max-height: none;
      min-width: 140mm;
      margin: 0 auto;
      border: 1px solid ${TF_LINE};
      border-radius: 8px;
      overflow: hidden;
      position: relative;
      background: #fff;
    }
    .ticket::before {
      content: "";
      position: absolute;
      left: 0; right: 0; top: 0;
      height: 3px;
      background: ${accent};
      z-index: 2;
    }
    .zone-a {
      position: relative;
      background: ${TF_NAVY};
      min-width: 0;
      min-height: 0;
    }
    .zone-a img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .zone-a .fallback {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px;
      text-align: center;
      color: #fff;
    }
    .zone-a .fallback strong {
      font-size: 11px;
      letter-spacing: .16em;
    }
    .zone-a .fallback span {
      font-size: 10px;
      opacity: .75;
    }
    .zone-b {
      padding: 10px 14px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      min-height: 0;
      background: #fff;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .brand-row img {
      height: 22px;
      width: auto;
      max-width: 110px;
      object-fit: contain;
    }
    .brand-row span {
      font-size: 9px;
      color: ${TF_MUTED};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .event {
      margin: 0;
      font-size: 16px;
      line-height: 1.15;
      font-weight: 700;
      color: ${TF_NAVY};
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .date {
      margin: 0;
      font-size: 11px;
      font-weight: 500;
      color: ${TF_NAVY};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .doors {
      margin: 2px 0 0;
      font-size: 13px;
      font-weight: 700;
      color: ${doorsColor};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .doors-note {
      margin: 0;
      font-size: 9px;
      color: ${TF_MUTED};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      margin-top: 4px;
      font-size: 10px;
      line-height: 1.3;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 4.25rem minmax(0, 1fr);
      gap: 4px;
      margin: 1px 0;
    }
    .meta-label { color: ${TF_MUTED}; }
    .meta-value {
      font-weight: 600;
      color: ${TF_NAVY};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .seat-boxes {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    .seat-box {
      flex: 1;
      min-width: 0;
      text-align: center;
      border: 1px solid ${TF_LINE};
      background: ${TF_SOFT};
      border-radius: 5px;
      padding: 4px 2px;
    }
    .seat-label {
      display: block;
      font-size: 7px;
      font-weight: 600;
      letter-spacing: .1em;
      color: ${TF_MUTED};
    }
    .seat-value {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: ${TF_NAVY};
    }
    .place {
      margin: 4px 0 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .02em;
      color: ${TF_NAVY};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .foot-meta {
      margin-top: auto;
      padding-top: 4px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      font-size: 9px;
      color: ${TF_MUTED};
    }
    .foot-meta strong {
      color: ${TF_NAVY};
      font-weight: 600;
    }
    .zone-c {
      background: ${TF_SOFT};
      border-left: 1px dashed ${TF_LINE};
      padding: 8px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      min-width: 0;
      min-height: 0;
      position: relative;
    }
    .zone-c::before,
    .zone-c::after {
      content: "";
      position: absolute;
      left: -6px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      border: 1px solid ${TF_LINE};
    }
    .zone-c::before { top: -6px; }
    .zone-c::after { bottom: -6px; }
    .admit {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .14em;
      color: ${accent};
      margin: 0 0 6px;
    }
    .qr-plate {
      background: #fff;
      padding: 6px;
      border-radius: 4px;
      line-height: 0;
    }
    .qr-plate img {
      width: min(118px, 18vw);
      height: auto;
      aspect-ratio: 1;
      display: block;
    }
    .ticket-no {
      margin-top: 6px;
      font-size: 10px;
      font-weight: 700;
      color: ${TF_NAVY};
      letter-spacing: .02em;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qr-hint {
      margin: 2px 0 0;
      font-size: 9px;
      color: ${TF_MUTED};
    }
    .notes {
      margin-top: 20px;
      max-width: 36rem;
    }
    .notes p {
      margin: 0 0 8px;
      font-size: 12px;
      color: ${TF_MUTED};
      line-height: 1.45;
    }
    /* Never stack columns — shrink whole landscape ticket on narrow viewports */
    @media (max-width: 640px) {
      .ticket {
        width: 200mm;
        transform-origin: top left;
      }
    }
    @media print {
      body { padding: 0; }
      .sheet { max-width: none; }
      .ticket-scale { overflow: visible; }
      .ticket {
        width: 186mm;
        aspect-ratio: ${TICKET_BODY_ASPECT} / 1;
        height: auto;
        min-width: 0;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="ticket-scale">
      <article class="ticket">
        <div class="zone-a">
          ${
            cover
              ? `<img src="${escapeAttr(cover)}" alt="" />`
              : `<div class="fallback"><strong>TICKETFEELING</strong><span>${escapeHtml(TF_TAGLINE)}</span></div>`
          }
        </div>
        <div class="zone-b">
          <div class="brand-row">
            <img src="/brand/logo-email.png" alt="Ticketfeeling" />
            <span>${escapeHtml(TF_TAGLINE)}</span>
          </div>
          <h1 class="event">${escapeHtml(data.eventName)}</h1>
          ${data.dateLabel ? `<p class="date">${escapeHtml(data.dateLabel)}</p>` : ""}
          ${
            data.doors.headline
              ? `<p class="doors">${escapeHtml(data.doors.headline)}${
                  data.doors.timeLabel ? " Uhr" : ""
                }</p>${
                  data.doors.doorsNote
                    ? `<p class="doors-note">${escapeHtml(data.doors.doorsNote)}</p>`
                    : ""
                }`
              : ""
          }
          <div class="meta">${metaRows}</div>
          ${seatHtml}
          ${footerBits ? `<div class="foot-meta">${footerBits}</div>` : ""}
        </div>
        <div class="zone-c">
          <p class="admit">${escapeHtml(admitLabel)}</p>
          <div class="qr-plate">
            ${
              qrDataUrlOrNull
                ? `<img src="${qrDataUrlOrNull}" alt="QR-Code" />`
                : `<p class="qr-hint">Kein gültiger QR-Code</p>`
            }
          </div>
          <p class="ticket-no">${escapeHtml(data.ticketNumber)}</p>
          <p class="qr-hint">${escapeHtml(TF_QR_HINT)}</p>
        </div>
      </article>
    </div>
    <div class="notes">
      <p>${escapeHtml(TF_PRINT_HINT)}</p>
      ${
        data.organizerDisplayName
          ? `<p>Veranstalter: ${escapeHtml(data.organizerDisplayName)}</p>`
          : ""
      }
    </div>
  </div>
</body>
</html>`;
}

function row(label: string, value: string, valueColor = TF_NAVY) {
  return `<div class="meta-row">
    <div class="meta-label">${escapeHtml(label)}</div>
    <div class="meta-value" style="color:${valueColor}">${escapeHtml(value)}</div>
  </div>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
