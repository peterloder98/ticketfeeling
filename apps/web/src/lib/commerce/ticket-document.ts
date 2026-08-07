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

/** Server-generated printable HTML ticket — same hierarchy as PDF / TicketFace. */
export async function renderTicketHtml(ticketId: string) {
  const data = await loadTicketPresentation(ticketId);
  const qr = data.qrToken ? await qrDataUrl(data.qrToken, 280) : null;
  return buildTicketHtmlDocument(data, qr);
}

export function buildTicketHtmlDocument(
  data: TicketPresentation,
  qrDataUrlOrNull: string | null,
): string {
  const accent = data.isVip ? TF_GOLD : TF_TEAL;
  const cover = data.coverAbsoluteUrl ?? data.coverUrl;

  const metaRows = [
    data.startLabel ? row("Beginn", data.startLabel) : "",
    row("Location", data.locationShort),
    row("Kategorie", data.categoryName, data.isVip ? accent : TF_NAVY),
    row("Platz", data.placeLabel),
    data.priceLabel ? row("Preis", data.priceLabel) : "",
    data.holderName ? row("Inhaber", data.holderName) : "",
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
    body {
      margin: 0;
      padding: 24px 16px;
      background: ${TF_SOFT};
      color: ${TF_INK};
      font-family: Inter, system-ui, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ticket {
      max-width: 480px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid ${TF_LINE};
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(15, 39, 71, 0.08);
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      background: ${TF_NAVY};
      color: #fff;
      padding: 16px 22px;
    }
    .brand {
      letter-spacing: .18em;
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 700;
    }
    .badge {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: ${accent};
    }
    .accent { height: 4px; background: ${accent}; }
    .body { padding: 24px 22px 28px; }
    .cover {
      width: 100%;
      max-width: 444px;
      aspect-ratio: 1 / 1;
      margin: 0 auto 20px;
      overflow: hidden;
      background: ${TF_NAVY};
    }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .event {
      text-align: center;
      font-size: 26px;
      line-height: 1.2;
      font-weight: 700;
      color: ${TF_NAVY};
      margin: 0 0 8px;
    }
    .date {
      text-align: center;
      font-size: 16px;
      font-weight: 500;
      color: ${TF_NAVY};
      margin: 0 0 16px;
    }
    .doors {
      text-align: center;
      font-size: 22px;
      font-weight: 700;
      color: ${data.isVip ? TF_GOLD : TF_NAVY};
      margin: 0 0 4px;
      letter-spacing: .02em;
    }
    .doors-note {
      text-align: center;
      font-size: 13px;
      color: ${TF_MUTED};
      margin: 0 0 18px;
    }
    .meta {
      max-width: 360px;
      margin: 0 auto 22px;
      font-size: 14px;
      line-height: 1.45;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 7.5rem 1fr;
      gap: 8px;
      margin: 6px 0;
    }
    .meta-label { color: ${TF_MUTED}; }
    .meta-value { font-weight: 600; color: ${TF_NAVY}; }
    .qr-box {
      border: 1px solid ${TF_LINE};
      background: ${TF_SOFT};
      border-radius: 16px;
      padding: 20px 16px;
      text-align: center;
    }
    .qr-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: ${accent};
      margin: 0 0 12px;
    }
    .qr-box img {
      width: 240px;
      height: 240px;
      background: #fff;
      padding: 10px;
      border-radius: 12px;
    }
    .ticket-no {
      margin-top: 14px;
      font-size: 16px;
      font-weight: 700;
      color: ${TF_NAVY};
      letter-spacing: .04em;
    }
    .hint {
      margin: 6px 0 0;
      font-size: 12px;
      color: ${TF_MUTED};
    }
    .foot {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid ${TF_LINE};
      text-align: center;
    }
    .org {
      font-size: 12px;
      color: ${TF_MUTED};
      margin: 0 0 8px;
      line-height: 1.45;
    }
    .org strong { color: ${TF_NAVY}; font-weight: 600; }
    .tf {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: .04em;
      color: ${TF_MUTED};
      margin: 0;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .ticket { box-shadow: none; border: none; border-radius: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="top">
      <div class="brand">Ticketfeeling</div>
      <div class="badge">${data.isVip ? "VIP-Ticket" : "Einlassticket"}</div>
    </div>
    <div class="accent"></div>
    <div class="body">
      ${
        cover
          ? `<div class="cover"><img src="${escapeAttr(cover)}" alt="" /></div>`
          : ""
      }
      <h1 class="event">${escapeHtml(data.eventName)}</h1>
      ${data.dateLabel ? `<p class="date">${escapeHtml(data.dateLabel)}</p>` : ""}
      ${
        data.doors.headline
          ? `<p class="doors">${escapeHtml(data.doors.headline)}${
              data.doors.timeLabel ? " Uhr" : ""
            }</p>${
              data.doors.doorsNote
                ? `<p class="doors-note">${escapeHtml(data.doors.doorsNote)}</p>`
                : `<div style="height:14px"></div>`
            }`
          : ""
      }
      <div class="meta">${metaRows}</div>
      <div class="qr-box">
        <p class="qr-label">QR-Code zum Einlass</p>
        ${
          qrDataUrlOrNull
            ? `<img src="${qrDataUrlOrNull}" alt="QR-Code" />`
            : `<p class="hint">Kein gültiger QR-Code</p>`
        }
        <p class="ticket-no">${escapeHtml(data.ticketNumber)}</p>
        <p class="hint">Am Einlass vorzeigen. Ausdruck oder Screenshot reicht.</p>
      </div>
      <div class="foot">
        <p class="org">
          <strong>Veranstalter:</strong>
          ${escapeHtml(data.organizerDisplayName)}${
            data.organizerAddress ? ` · ${escapeHtml(data.organizerAddress)}` : ""
          }
        </p>
        <p class="tf">${escapeHtml(TF_TAGLINE)}</p>
      </div>
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
