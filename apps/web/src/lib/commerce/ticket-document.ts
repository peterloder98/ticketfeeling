import { qrDataUrl } from "@/lib/qr-server";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import {
  loadTicketPresentation,
  parseSeatHighlight,
  sponsorLogoBoxForScale,
  TF_GOLD,
  TF_INK,
  TF_LINE,
  TF_MUTED,
  TF_NAVY,
  TF_PRINT_HINT,
  TF_QR_HINT,
  TF_SOFT,
  TF_TEAL,
  TICKET_ACCENT_H_PX,
  TICKET_BODY_ASPECT,
  TICKET_BRAND_LOGO_GAP_PX,
  TICKET_BRAND_LOGO_H_PX,
  TICKET_COL_COVER,
  TICKET_COL_QR,
  TICKET_CORNER_RADIUS_PX,
  TICKET_FACE_TYPE,
  TICKET_QR_MIN_PX,
  type TicketPresentation,
} from "@/lib/commerce/ticket-presentation";

export type TicketFaceHtmlOptions = {
  /** Embed / compact density */
  compact?: boolean;
  /** Force absolute http(s) asset URLs (Chromium PDF / emails) */
  absoluteAssets?: boolean;
  /** When QR must not show (transferred / locked) */
  qrUnavailableMessage?: string | null;
  /** Footer hint under the strip */
  includeNotes?: boolean;
};

export type TicketFaceEmbed = {
  /** Scoped CSS (no surrounding document) */
  css: string;
  /** Ticket article + optional notes */
  html: string;
  printHint: string;
};

function toAbsoluteAssetUrl(
  pathOrUrl: string | null | undefined,
  base: string,
): string | null {
  if (!pathOrUrl) return null;
  const value = pathOrUrl.trim();
  if (!value) return null;
  if (/^(https?:|data:)/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${base}${value}`;
  return `${base}/${value}`;
}

/**
 * Canonical ticket face — single source for online embed, print HTML, and PDF.
 */
export function buildTicketFaceEmbed(
  data: TicketPresentation,
  qrDataUrlOrNull: string | null,
  options?: TicketFaceHtmlOptions,
): TicketFaceEmbed {
  const compact = Boolean(options?.compact);
  const absoluteAssets = options?.absoluteAssets !== false;
  const base = getPublicAppUrl();
  const T = TICKET_FACE_TYPE;
  const scale = compact ? 0.92 : 1;

  const accent = data.isVip ? TF_GOLD : TF_TEAL;
  const cover = absoluteAssets
    ? toAbsoluteAssetUrl(data.coverAbsoluteUrl ?? data.coverUrl, base)
    : data.coverUrl ?? data.coverAbsoluteUrl;
  const brandLogo = absoluteAssets
    ? toAbsoluteAssetUrl("/brand/logo-ticketfeeling.png", base)!
    : "/brand/logo-ticketfeeling.png";
  const admitLabel = data.isVip ? "VIP-TICKET" : "EINLASSTICKET";
  const doorsAccent =
    data.isVip || data.doors.isCategoryOverride ? accent : TF_NAVY;
  const seat = parseSeatHighlight(data.placeDisplayLabel, data.hasAssignedSeat);
  const coverPct = Math.round(TICKET_COL_COVER * 100);
  const qrPct = Math.round(TICKET_COL_QR * 100);
  const infoPct = 100 - coverPct - qrPct;

  const logoH = Math.round(TICKET_BRAND_LOGO_H_PX * scale);
  const logoGap = Math.round(TICKET_BRAND_LOGO_GAP_PX * (compact ? 0.9 : 1));
  const titleSize = Math.round(T.titleSize * scale);
  const dateSize = Math.round(T.dateSize * scale);
  const locSize = Math.round(T.locSize * scale);
  const locDetailSize = Math.round(T.locDetailSize * scale);
  const doorsLabelSize = Math.round(T.doorsLabelSize * scale);
  const doorsTimeSize = Math.round(T.doorsTimeSize * scale);
  const categorySize = Math.round(T.categorySize * scale);
  const vipBadgeSize = Math.round(T.vipBadgeSize * scale);
  const seatTextSize = Math.round(T.seatTextSize * scale);
  const seatBoxValueSize = Math.round(T.seatBoxValueSize * scale);
  const footerSize = Math.round(T.footerSize * scale);
  const admitSize = Math.round(T.admitSize * scale);
  const ticketNoSize = Math.round(T.ticketNoSize * scale);
  const hintSize = Math.round(T.hintSize * scale);
  const padX = Math.round(T.padX * scale);
  const padY = Math.round(T.padY * scale);

  const sponsorAboveRaw =
    data.sponsorLogoAboveAbsoluteUrl ?? data.sponsorLogoAboveUrl;
  const sponsorBelowRaw =
    data.sponsorLogoBelowAbsoluteUrl ?? data.sponsorLogoBelowUrl;
  const sponsorAbove = absoluteAssets
    ? toAbsoluteAssetUrl(sponsorAboveRaw, base)
    : sponsorAboveRaw;
  const sponsorBelow = absoluteAssets
    ? toAbsoluteAssetUrl(sponsorBelowRaw, base)
    : sponsorBelowRaw;
  const hasSponsor = Boolean(sponsorAbove || sponsorBelow);
  const qrPx = hasSponsor
    ? Math.max(TICKET_QR_MIN_PX, Math.round(T.qrWithSponsor * scale))
    : Math.round(T.qrNoSponsor * scale);
  const aboveBox = sponsorLogoBoxForScale(data.sponsorLogoAboveScale);
  const belowBox = sponsorLogoBoxForScale(data.sponsorLogoBelowScale);
  const aboveMaxW = compact ? Math.min(124, aboveBox.maxW) : aboveBox.maxW;
  const aboveMaxH = compact ? Math.min(36, aboveBox.maxH) : aboveBox.maxH;
  const belowMaxW = compact ? Math.min(124, belowBox.maxW) : belowBox.maxW;
  const belowMaxH = compact ? Math.min(36, belowBox.maxH) : belowBox.maxH;

  const seatHtml =
    seat.mode === "boxes"
      ? `<div class="tf-seat-boxes">${seat.parts
          .map(
            (p) => `<div class="tf-seat-box">${
              p.label
                ? `<span class="tf-seat-label">${escapeHtml(p.label)}</span>`
                : ""
            }<span class="tf-seat-value">${escapeHtml(p.value)}</span></div>`,
          )
          .join("")}</div>`
      : `<p class="tf-place">${escapeHtml(seat.text)}</p>`;

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

  const coverHtml = cover
    ? `<div class="tf-cover-blur" style="background-image:url('${escapeAttr(cover)}')"></div>
       <div class="tf-cover-shade"></div>
       <div class="tf-cover-inset"><img src="${escapeAttr(cover)}" alt="" /></div>`
    : `<div class="tf-fallback">
         <div class="tf-fallback-logo-plate">
           <img src="${escapeAttr(brandLogo)}" alt="Ticketfeeling" />
         </div>
       </div>`;

  const vipBadge = data.isVip
    ? `<span class="tf-vip-badge">VIP</span>`
    : "";
  const categoryLabel =
    data.isVip && /^vip$/i.test(data.categoryName.trim())
      ? ""
      : `<strong>${escapeHtml(data.categoryName)}</strong>`;
  const categoryHtml = `<p class="tf-category">Kategorie ${vipBadge}${categoryLabel}</p>`;

  const sponsorAboveHtml = sponsorAbove
    ? `<img class="tf-sponsor-logo" style="width:${aboveMaxW}px;height:${aboveMaxH}px;object-fit:contain" src="${escapeAttr(sponsorAbove)}" alt="" />`
    : "";
  const sponsorBelowHtml = sponsorBelow
    ? `<img class="tf-sponsor-logo" style="width:${belowMaxW}px;height:${belowMaxH}px;object-fit:contain" src="${escapeAttr(sponsorBelow)}" alt="" />`
    : "";

  const doorsBeginHtml =
    data.doors.headline || data.startLabel
      ? `<div class="tf-doors-begin">
          <div>
            <div class="tf-db-label">${escapeHtml((data.doors.headlineLabel || "Einlass").toUpperCase())}</div>
            <div class="tf-db-value" style="color:${data.doors.timeLabel ? doorsAccent : TF_MUTED}">${
              data.doors.timeLabel
                ? `${escapeHtml(data.doors.timeLabel)} Uhr`
                : "—"
            }</div>
            ${
              data.doors.doorsNote
                ? `<div class="tf-db-note">${escapeHtml(data.doors.doorsNote)}</div>`
                : ""
            }
          </div>
          <div class="tf-db-begin">
            <div class="tf-db-label">BEGINN</div>
            <div class="tf-db-value">${escapeHtml(data.startLabel ?? "—")}</div>
          </div>
        </div>`
      : "";

  const qrCore = qrDataUrlOrNull
    ? `<div class="tf-qr-plate"><img src="${qrDataUrlOrNull}" alt="QR-Code" width="${qrPx}" height="${qrPx}" /></div>
       <p class="tf-ticket-no">${escapeHtml(data.ticketNumber)}</p>
       <p class="tf-qr-hint">${escapeHtml(TF_QR_HINT)}</p>`
    : `<div class="tf-qr-locked">
         <p class="tf-qr-locked-title">${escapeHtml(
           options?.qrUnavailableMessage
             ? "Ticket weitergeleitet"
             : "QR nicht verfügbar",
         )}</p>
         ${
           options?.qrUnavailableMessage
             ? `<p class="tf-qr-locked-msg">${escapeHtml(options.qrUnavailableMessage)}</p>`
             : ""
         }
         <p class="tf-ticket-no">${escapeHtml(data.ticketNumber)}</p>
       </div>`;

  const printHint = data.organizerDisplayName
    ? `${TF_PRINT_HINT} · Veranstalter: ${data.organizerDisplayName}`
    : TF_PRINT_HINT;

  const includeNotes = options?.includeNotes !== false;
  const notesHtml = includeNotes
    ? `<p class="tf-notes">${escapeHtml(printHint)}</p>`
    : "";

  const minW = compact ? 560 : 640;
  const maxW = compact ? 720 : 900;

  const css = `
.tf-face-root { width: 100%; min-width: 0; font-family: Inter, system-ui, sans-serif; color: ${TF_INK}; }
.tf-face-scroll { width: 100%; overflow-x: auto; padding-bottom: 4px; -ms-overflow-style: none; scrollbar-width: none; }
.tf-face-scroll::-webkit-scrollbar { display: none; }
.tf-ticket {
  display: grid;
  grid-template-columns: ${coverPct}% minmax(0, ${infoPct}%) ${qrPct}%;
  grid-template-rows: 1fr;
  width: 100%;
  min-width: ${minW}px;
  max-width: ${maxW}px;
  margin: 0 auto;
  aspect-ratio: ${TICKET_BODY_ASPECT} / 1;
  border: 1px solid ${TF_LINE};
  border-radius: ${TICKET_CORNER_RADIUS_PX}px;
  overflow: hidden;
  position: relative;
  background: #fff;
  box-shadow: 0 12px 40px rgba(15,39,71,0.08);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.tf-ticket::before {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 0;
  height: ${TICKET_ACCENT_H_PX}px;
  background: ${accent};
  z-index: 20;
}
.tf-zone-a {
  position: relative;
  background: ${TF_NAVY};
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.tf-cover-blur {
  position: absolute;
  inset: -14%;
  background-size: cover;
  background-position: center;
  filter: blur(28px) saturate(0.95);
  transform: scale(1.1);
}
.tf-cover-shade {
  position: absolute;
  inset: 0;
  background: rgba(15, 39, 71, 0.52);
}
.tf-cover-inset {
  position: absolute;
  inset: 2%;
  overflow: hidden;
  background: transparent;
}
.tf-cover-inset img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  transform: scale(1.06);
}
.tf-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${TF_NAVY};
}
.tf-fallback-logo-plate {
  background: rgba(255,255,255,.95);
  border-radius: 8px;
  padding: 6px 10px;
  line-height: 0;
}
.tf-fallback-logo-plate img {
  height: ${Math.round(logoH * 0.75)}px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
}
.tf-zone-b {
  padding: ${padY}px ${padX}px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: ${T.gap}px;
  min-width: 0;
  min-height: 0;
  background: #fff;
}
.tf-brand-row {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  margin-bottom: ${logoGap}px;
}
.tf-brand-row img {
  height: ${logoH}px;
  width: auto;
  max-width: 160px;
  object-fit: contain;
}
.tf-event {
  margin: 0;
  font-size: ${titleSize}px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: ${TF_NAVY};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tf-date {
  margin: 0;
  font-size: ${dateSize}px;
  font-weight: 700;
  color: ${TF_NAVY};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tf-loc-name {
  margin: 0;
  font-size: ${locSize}px;
  font-weight: 700;
  color: ${TF_NAVY};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tf-loc-detail {
  margin: 0;
  font-size: ${locDetailSize}px;
  color: ${TF_MUTED};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tf-doors-begin {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0;
  padding: 4px 0;
  border-top: 1px solid ${TF_LINE};
  border-bottom: 1px solid ${TF_LINE};
}
.tf-db-begin {
  border-left: 1px solid ${TF_LINE};
  padding-left: 8px;
}
.tf-db-label {
  font-size: ${doorsLabelSize}px;
  font-weight: 600;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: ${TF_MUTED};
}
.tf-db-value {
  font-size: ${doorsTimeSize}px;
  font-weight: 700;
  color: ${TF_NAVY};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tf-db-note {
  font-size: 9px;
  color: ${TF_MUTED};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tf-category {
  margin: 0;
  font-size: ${categorySize}px;
  color: ${TF_MUTED};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tf-category strong {
  font-weight: 600;
  color: ${TF_NAVY};
}
.tf-vip-badge {
  display: inline-block;
  border: 1px solid rgba(214,166,66,0.55);
  background: rgba(214,166,66,0.12);
  color: ${TF_GOLD};
  font-size: ${vipBadgeSize}px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
}
.tf-seat-boxes {
  display: flex;
  gap: 6px;
}
.tf-seat-box {
  flex: 1;
  min-width: 0;
  text-align: center;
  border: 1px solid ${TF_LINE};
  background: ${TF_SOFT};
  border-radius: 6px;
  padding: 4px 2px;
}
.tf-seat-label {
  display: block;
  font-size: 8px;
  font-weight: 600;
  letter-spacing: .12em;
  color: ${TF_MUTED};
}
.tf-seat-value {
  display: block;
  font-size: ${seatBoxValueSize}px;
  font-weight: 700;
  color: ${TF_NAVY};
}
.tf-place {
  margin: 0;
  font-size: ${seatTextSize}px;
  font-weight: 700;
  letter-spacing: .02em;
  color: ${TF_NAVY};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tf-foot-meta {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: ${footerSize}px;
  color: ${TF_MUTED};
}
.tf-foot-meta strong {
  color: ${TF_NAVY};
  font-weight: 600;
}
.tf-zone-c {
  background: ${TF_SOFT};
  border-left: 1px dashed ${TF_LINE};
  padding: ${T.stubPadY}px ${T.stubPadX}px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: stretch;
  text-align: center;
  min-width: 0;
  min-height: 0;
  position: relative;
}
.tf-sponsor-slot {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  width: 100%;
  padding: 4px 2px;
}
.tf-sponsor-logo {
  display: block;
  max-width: 100%;
  object-fit: contain;
  background: transparent;
}
.tf-zone-c-core {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
}
.tf-zone-c::before,
.tf-zone-c::after {
  content: "";
  position: absolute;
  left: -6px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(248,250,252,0.95);
  border: 1px solid ${TF_LINE};
}
.tf-zone-c::before { top: -6px; }
.tf-zone-c::after { bottom: -6px; }
.tf-admit {
  font-size: ${admitSize}px;
  font-weight: 700;
  letter-spacing: .14em;
  color: ${accent};
  margin: 0;
}
.tf-qr-plate {
  background: #fff;
  padding: ${T.qrPlatePad}px;
  border-radius: 6px;
  line-height: 0;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(15,39,71,0.06);
}
.tf-qr-plate img {
  width: ${qrPx}px;
  height: ${qrPx}px;
  display: block;
}
.tf-ticket-no {
  margin: 0;
  font-size: ${ticketNoSize}px;
  font-weight: 700;
  color: ${TF_NAVY};
  letter-spacing: .02em;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tf-qr-hint {
  margin: 0;
  font-size: ${hintSize}px;
  color: ${TF_MUTED};
}
.tf-qr-locked {
  max-width: 11rem;
  padding: 0 4px;
}
.tf-qr-locked-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: ${TF_NAVY};
}
.tf-qr-locked-msg {
  margin: 4px 0 0;
  font-size: 10px;
  line-height: 1.35;
  color: ${TF_MUTED};
}
.tf-notes {
  margin: 12px auto 0;
  max-width: ${maxW}px;
  font-size: 12px;
  color: ${TF_MUTED};
  line-height: 1.45;
  text-align: left;
}
`.trim();

  const html = `
<div class="tf-face-root">
  <div class="tf-face-scroll">
    <article class="tf-ticket">
      <div class="tf-zone-a">${coverHtml}</div>
      <div class="tf-zone-b">
        <div class="tf-brand-row">
          <img src="${escapeAttr(brandLogo)}" alt="Ticketfeeling" />
        </div>
        <h1 class="tf-event">${escapeHtml(data.eventName)}</h1>
        ${data.dateLabel ? `<p class="tf-date">${escapeHtml(data.dateLabel)}</p>` : ""}
        <p class="tf-loc-name">${escapeHtml(data.locationName)}</p>
        ${
          data.locationDetail
            ? `<p class="tf-loc-detail">${escapeHtml(data.locationDetail)}</p>`
            : ""
        }
        ${doorsBeginHtml}
        ${categoryHtml}
        ${seatHtml}
        ${footerBits ? `<div class="tf-foot-meta">${footerBits}</div>` : ""}
      </div>
      <div class="tf-zone-c">
        <div class="tf-sponsor-slot">${sponsorAboveHtml}</div>
        <div class="tf-zone-c-core">
          <p class="tf-admit">${escapeHtml(admitLabel)}</p>
          ${qrCore}
        </div>
        <div class="tf-sponsor-slot">${sponsorBelowHtml}</div>
      </div>
    </article>
  </div>
  ${notesHtml}
</div>`.trim();

  return { css, html, printHint };
}

/** Full HTML document for Chromium PDF / browser print. */
export function buildTicketHtmlDocument(
  data: TicketPresentation,
  qrDataUrlOrNull: string | null,
  options?: TicketFaceHtmlOptions,
): string {
  const face = buildTicketFaceEmbed(data, qrDataUrlOrNull, {
    absoluteAssets: true,
    includeNotes: true,
    ...options,
  });
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
    ${face.css}
    .tf-ticket {
      max-width: 186mm;
      min-width: 0;
      width: 100%;
      box-shadow: none;
    }
    @media print {
      body { padding: 0; }
      .tf-face-scroll { overflow: visible; }
    }
  </style>
</head>
<body>
  ${face.html}
</body>
</html>`;
}

/** Multi-ticket A4 document (page break between faces). */
export function buildOrderTicketsHtmlDocument(
  pages: Array<{
    data: TicketPresentation;
    qr: string | null;
    options?: TicketFaceHtmlOptions;
  }>,
): string {
  const bodies = pages.map((page, index) => {
    const face = buildTicketFaceEmbed(page.data, page.qr, {
      absoluteAssets: true,
      includeNotes: true,
      ...page.options,
    });
    const breakStyle =
      index < pages.length - 1 ? "page-break-after: always;" : "";
    return `<section class="tf-pdf-page" style="${breakStyle}">${face.html}</section>`;
  });

  const sampleCss =
    pages[0]
      ? buildTicketFaceEmbed(pages[0].data, pages[0].qr, {
          absoluteAssets: true,
          includeNotes: true,
          ...pages[0].options,
        }).css
      : "";

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Tickets</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    @page { size: A4 portrait; margin: 12mm; }
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Inter, system-ui, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${sampleCss}
    .tf-ticket {
      max-width: 186mm;
      min-width: 0;
      width: 100%;
      box-shadow: none;
    }
    .tf-pdf-page { padding: 4mm 0; }
  </style>
</head>
<body>
  ${bodies.join("\n")}
</body>
</html>`;
}

/** Server-generated printable HTML ticket. */
export async function renderTicketHtml(ticketId: string) {
  const data = await loadTicketPresentation(ticketId);
  const qr = data.qrToken ? await qrDataUrl(data.qrToken, 320) : null;
  return buildTicketHtmlDocument(data, qr);
}

export async function loadTicketFaceEmbed(
  ticketId: string,
  options?: TicketFaceHtmlOptions & {
    showQr?: boolean;
  },
): Promise<TicketFaceEmbed & { data: TicketPresentation }> {
  const data = await loadTicketPresentation(ticketId);
  const showQr = options?.showQr !== false && Boolean(data.qrToken);
  const qr =
    showQr && data.qrToken ? await qrDataUrl(data.qrToken, 320) : null;
  const face = buildTicketFaceEmbed(data, qr, {
    absoluteAssets: true,
    includeNotes: true,
    ...options,
    qrUnavailableMessage: options?.qrUnavailableMessage ?? null,
  });
  return { ...face, data };
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
