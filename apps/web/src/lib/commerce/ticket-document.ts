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
  TICKET_SPONSOR_LOGO_MAX_H_PX,
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
  const doorsAccent =
    data.isVip || data.doors.isCategoryOverride ? accent : TF_NAVY;
  const seat = parseSeatHighlight(data.placeDisplayLabel, data.hasAssignedSeat);
  const coverPct = Math.round(TICKET_COL_COVER * 100);
  const qrPct = Math.round(TICKET_COL_QR * 100);
  const infoPct = 100 - coverPct - qrPct;

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

  const sponsorAbove =
    data.sponsorLogoAboveAbsoluteUrl ?? data.sponsorLogoAboveUrl;
  const sponsorBelow =
    data.sponsorLogoBelowAbsoluteUrl ?? data.sponsorLogoBelowUrl;
  const hasSponsor = Boolean(sponsorAbove || sponsorBelow);

  const coverHtml = cover
    ? `<div class="cover-blur" style="background-image:url('${escapeAttr(cover)}')"></div>
       <div class="cover-shade"></div>
       <div class="cover-inset"><img src="${escapeAttr(cover)}" alt="" /></div>`
    : `<div class="fallback">
         <div class="fallback-monogram" aria-hidden="true"></div>
         <div class="fallback-logo-plate">
           <img src="/brand/logo-email.png" alt="Ticketfeeling" />
         </div>
         <span class="fallback-accent" aria-hidden="true"></span>
       </div>`;

  const sponsorAboveHtml = sponsorAbove
    ? `<div class="sponsor-logo"><img src="${escapeAttr(sponsorAbove)}" alt="" /></div>`
    : "";
  const sponsorBelowHtml = sponsorBelow
    ? `<div class="sponsor-logo"><img src="${escapeAttr(sponsorBelow)}" alt="" /></div>`
    : "";

  const doorsBeginHtml =
    data.doors.headline || data.startLabel
      ? `<div class="doors-begin">
          <div>
            <div class="db-label">${escapeHtml(data.doors.headlineLabel || "Einlass")}</div>
            <div class="db-value" style="color:${data.doors.timeLabel ? doorsAccent : TF_MUTED}">${
              data.doors.timeLabel
                ? `${escapeHtml(data.doors.timeLabel)} Uhr`
                : "—"
            }</div>
            ${
              data.doors.doorsNote
                ? `<div class="db-note">${escapeHtml(data.doors.doorsNote)}</div>`
                : ""
            }
          </div>
          <div class="db-begin">
            <div class="db-label">Beginn</div>
            <div class="db-value">${escapeHtml(data.startLabel ?? "—")}</div>
          </div>
        </div>`
      : "";

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
      overflow: hidden;
    }
    .cover-blur {
      position: absolute;
      inset: -12%;
      background-size: cover;
      background-position: center;
      filter: blur(16px);
      transform: scale(1.08);
    }
    .cover-shade {
      position: absolute;
      inset: 0;
      background: rgba(15, 39, 71, 0.55);
    }
    .cover-inset {
      position: absolute;
      inset: 7%;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 6px 18px rgba(0,0,0,.28);
      outline: 1px solid rgba(255,255,255,.15);
      background: rgba(15, 39, 71, 0.35);
    }
    .cover-inset img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .zone-a .fallback {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      text-align: center;
      color: #fff;
      background: linear-gradient(160deg, #0F2747 0%, #163A5F 48%, #0B1C33 100%);
    }
    .fallback-monogram {
      position: absolute;
      right: -8px;
      top: -10px;
      width: 88px;
      height: 54px;
      opacity: .1;
      background: rgba(255,255,255,.92);
      border-radius: 12px;
      background-image: url("/brand/icon-tf.png");
      background-size: 72px auto;
      background-repeat: no-repeat;
      background-position: center;
    }
    .fallback-logo-plate {
      background: rgba(255,255,255,.95);
      border-radius: 8px;
      padding: 6px 10px;
      line-height: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,.18);
    }
    .fallback-logo-plate img {
      height: 26px;
      width: auto;
      max-width: 120px;
      object-fit: contain;
    }
    .fallback-accent {
      width: 28px;
      height: 2px;
      border-radius: 99px;
      background: ${TF_TEAL};
    }
    .zone-b {
      padding: 8px 14px 8px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      min-height: 0;
      background: #fff;
    }
    .brand-row {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .brand-row img {
      height: 28px;
      width: auto;
      max-width: 130px;
      object-fit: contain;
    }
    .event {
      margin: 0;
      font-size: 16px;
      line-height: 1.12;
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
    .loc-name {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      color: ${TF_NAVY};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .loc-detail {
      margin: 0;
      font-size: 9px;
      color: ${TF_MUTED};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .doors-begin {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 2px 0 0;
      padding: 5px 0;
      border-top: 1px solid ${TF_LINE};
      border-bottom: 1px solid ${TF_LINE};
    }
    .db-begin {
      border-left: 1px solid ${TF_LINE};
      padding-left: 8px;
    }
    .db-label {
      font-size: 7px;
      font-weight: 600;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: ${TF_MUTED};
    }
    .db-value {
      font-size: 12px;
      font-weight: 700;
      color: ${TF_NAVY};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .db-note {
      font-size: 8px;
      color: ${TF_MUTED};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .category {
      margin: 1px 0 0;
      font-size: 10px;
      color: ${TF_MUTED};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .category strong {
      font-weight: 600;
      color: ${data.isVip ? TF_GOLD : TF_NAVY};
    }
    .seat-boxes {
      display: flex;
      gap: 6px;
      margin-top: 3px;
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
      margin: 3px 0 0;
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
      padding-top: 3px;
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
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      text-align: center;
      min-width: 0;
      min-height: 0;
      position: relative;
    }
    .sponsor-logo {
      width: 92%;
      max-width: 120px;
      height: ${TICKET_SPONSOR_LOGO_MAX_H_PX}px;
      flex-shrink: 0;
      line-height: 0;
    }
    .sponsor-logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
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
      margin: 0;
    }
    .qr-plate {
      background: #fff;
      padding: 5px;
      border-radius: 4px;
      line-height: 0;
      flex-shrink: 0;
    }
    .qr-plate img {
      width: min(${hasSponsor ? 112 : 128}px, 20vw);
      height: auto;
      aspect-ratio: 1;
      display: block;
    }
    .ticket-no {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      color: ${TF_NAVY};
      letter-spacing: .02em;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qr-hint {
      margin: 0;
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
        <div class="zone-a">${coverHtml}</div>
        <div class="zone-b">
          <div class="brand-row">
            <img src="/brand/logo-email.png" alt="Ticketfeeling" />
          </div>
          <h1 class="event">${escapeHtml(data.eventName)}</h1>
          ${data.dateLabel ? `<p class="date">${escapeHtml(data.dateLabel)}</p>` : ""}
          <p class="loc-name">${escapeHtml(data.locationName)}</p>
          ${
            data.locationDetail
              ? `<p class="loc-detail">${escapeHtml(data.locationDetail)}</p>`
              : ""
          }
          ${doorsBeginHtml}
          <p class="category">Kategorie <strong>${escapeHtml(data.categoryName)}</strong></p>
          ${seatHtml}
          ${footerBits ? `<div class="foot-meta">${footerBits}</div>` : ""}
        </div>
        <div class="zone-c">
          <p class="admit">${escapeHtml(admitLabel)}</p>
          ${sponsorAboveHtml}
          <div class="qr-plate">
            ${
              qrDataUrlOrNull
                ? `<img src="${qrDataUrlOrNull}" alt="QR-Code" />`
                : `<p class="qr-hint">Kein gültiger QR-Code</p>`
            }
          </div>
          ${sponsorBelowHtml}
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
