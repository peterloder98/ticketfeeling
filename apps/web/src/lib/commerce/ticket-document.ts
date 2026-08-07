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

/** Server-generated printable HTML ticket — landscape strip on A4, same rules as PDF. */
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

  const metaRows = [
    data.startLabel ? row("Beginn", data.startLabel) : "",
    row("Location", data.locationTicket),
    row("Kategorie", data.categoryName, data.isVip ? TF_GOLD : TF_NAVY),
    data.holderName ? row("Inhaber", data.holderName) : "",
    data.priceLabel ? row("Preis", data.priceLabel) : "",
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
    .ticket {
      display: grid;
      grid-template-columns: 30% minmax(0, 1fr) 27%;
      width: 100%;
      aspect-ratio: 1.72 / 1;
      max-height: 112mm;
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
      padding: 14px 16px 12px;
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: #fff;
    }
    .event {
      margin: 0;
      font-size: clamp(14px, 2.1vw, 18px);
      line-height: 1.2;
      font-weight: 700;
      color: ${TF_NAVY};
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .date {
      margin: 6px 0 0;
      font-size: 12px;
      font-weight: 500;
      color: ${TF_NAVY};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .doors {
      margin: 8px 0 0;
      font-size: 14px;
      font-weight: 700;
      color: ${doorsColor};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .doors-note {
      margin: 2px 0 0;
      font-size: 10px;
      color: ${TF_MUTED};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      margin-top: 10px;
      font-size: 11px;
      line-height: 1.35;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 4.5rem minmax(0, 1fr);
      gap: 6px;
      margin: 3px 0;
    }
    .meta-label { color: ${TF_MUTED}; }
    .meta-value {
      font-weight: 600;
      color: ${TF_NAVY};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .place {
      margin: 10px 0 0;
      font-size: ${data.hasAssignedSeat ? "15px" : "13px"};
      font-weight: 700;
      letter-spacing: .02em;
      color: ${TF_NAVY};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .brand-foot {
      margin-top: auto;
      padding-top: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .brand-foot img {
      height: 16px;
      width: auto;
      max-width: 96px;
      object-fit: contain;
    }
    .brand-foot span {
      font-size: 10px;
      color: ${TF_MUTED};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .zone-c {
      background: ${TF_SOFT};
      border-left: 1px dashed ${TF_LINE};
      padding: 12px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      min-width: 0;
    }
    .admit {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .14em;
      color: ${accent};
      margin: 0 0 8px;
    }
    .qr-plate {
      background: #fff;
      padding: 8px;
      border-radius: 4px;
      line-height: 0;
    }
    .qr-plate img {
      width: min(132px, 22vw);
      height: auto;
      aspect-ratio: 1;
      display: block;
    }
    .ticket-no {
      margin-top: 8px;
      font-size: 11px;
      font-weight: 700;
      color: ${TF_NAVY};
      letter-spacing: .02em;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qr-hint {
      margin: 4px 0 0;
      font-size: 10px;
      color: ${TF_MUTED};
    }
    .notes {
      margin-top: 28px;
      max-width: 36rem;
    }
    .notes p {
      margin: 0 0 8px;
      font-size: 12px;
      color: ${TF_MUTED};
      line-height: 1.45;
    }
    @media print {
      body { padding: 0; }
      .sheet { max-width: none; }
      .ticket { max-height: none; height: 105mm; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <article class="ticket">
      <div class="zone-a">
        ${
          cover
            ? `<img src="${escapeAttr(cover)}" alt="" />`
            : `<div class="fallback"><strong>TICKETFEELING</strong><span>${escapeHtml(TF_TAGLINE)}</span></div>`
        }
      </div>
      <div class="zone-b">
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
        <p class="place">${escapeHtml(data.placeDisplayLabel)}</p>
        <div class="brand-foot">
          <img src="/brand/logo-email.png" alt="Ticketfeeling" />
          <span>${escapeHtml(TF_TAGLINE)}</span>
        </div>
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
