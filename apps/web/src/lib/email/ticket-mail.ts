import { readFileSync, existsSync } from "fs";
import path from "path";
import { formalGermanGreeting } from "@/lib/commerce/formal-address";
import { getPublicAppUrl } from "@/lib/embed/public-url";
import { isAppleWalletConfigured, isGoogleWalletConfigured } from "@/lib/wallet/config";

function appBaseUrl() {
  return getPublicAppUrl();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Brand-aligned stack for HTML mail (Inter when available, otherwise system UI). */
const EMAIL_FONT =
  "Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

/**
 * Sharp TF mark for e-mail (not the soft JPEG-derived lockup PNG).
 * Display ~72×44; source is 535×329 (retina).
 */
const EMAIL_MARK = {
  path: "/brand/icon-tf.png",
  displayW: 72,
  displayH: 44,
} as const;

/** Hosted mark URL for clients that load remote images / CID fallback. */
export function emailLogoRemoteUrl() {
  return `${appBaseUrl()}${EMAIL_MARK.path}`;
}

/**
 * Prefer the official sharp mark PNG for CID embedding.
 * Never use soft `logo-ticketfeeling.png` / `logo-email.png` as the mail header.
 */
export function loadEmailLogoBuffer(): Buffer | null {
  const candidates = [
    path.join(process.cwd(), "public/brand/icon-tf.png"),
    path.join(process.cwd(), "apps/web/public/brand/icon-tf.png"),
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

export const EMAIL_LOGO_CID = "ticketfeeling-logo";

/** Centered mark + crisp HTML wordmark (avoids soft lockup raster). */
export function emailBrandHeaderHtml(logoSrc = `cid:${EMAIL_LOGO_CID}`) {
  const logoFallback = emailLogoRemoteUrl();
  const { displayW, displayH } = EMAIL_MARK;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto">
  <tr>
    <td align="center" style="padding:0 0 10px">
      <img src="${logoSrc}" alt="Ticketfeeling" width="${displayW}" height="${displayH}" style="display:block;width:${displayW}px;height:${displayH}px;border:0;outline:none" />
      <!--[if !mso]><!-- -->
      <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">
        <img src="${escapeHtml(logoFallback)}" alt="" width="1" height="1" />
      </div>
      <!--<![endif]-->
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0;font-family:${EMAIL_FONT};font-weight:700;font-size:22px;letter-spacing:-0.02em;line-height:1.15">
      <span style="color:#0F2747">ticket</span><span style="color:#14B8A6">feeling</span>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:6px 0 0;font-family:${EMAIL_FONT};font-weight:600;font-size:11px;letter-spacing:0.14em;line-height:1.3;color:#14B8A6">
      MEHR ALS EIN TICKET.
    </td>
  </tr>
</table>`;
}

/**
 * Shared HTML shell for transactional buyer mail.
 * No company / Impressum address here — that belongs on invoices and legal pages only.
 */
function wrapHtml(paragraphs: string[], opts?: { hasAttachment?: boolean }) {
  const logoSrc = `cid:${EMAIL_LOGO_CID}`;
  const body = paragraphs
    .map((p) => {
      if (!p) return "<br/>";
      // Tables / block roots must not sit inside <p> (invalid HTML in mail clients).
      if (/<(?:table|div|ul|ol)\b/i.test(p)) {
        return `<div style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#0F2747;font-family:${EMAIL_FONT}">${p}</div>`;
      }
      return `<p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#0F2747;font-family:${EMAIL_FONT}">${p}</p>`;
    })
    .join("");
  // Legacy: only when a caller still expects attachments and generation failed.
  const attachHint =
    opts?.hasAttachment === false
      ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#B45309;font-family:${EMAIL_FONT}">Hinweis: Die PDF-Anhänge konnten nicht erzeugt werden — öffne deine Tickets über den Link unten.</p>`
      : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EEF2F7">
  <div style="padding:28px 16px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #E2E8F0">
    <div style="background:#ffffff;padding:22px 28px 16px;text-align:center;border-bottom:1px solid #E2E8F0">
      ${emailBrandHeaderHtml(logoSrc)}
    </div>
    <div style="height:4px;background:#14B8A6"></div>
    <div style="padding:28px 28px 8px">
      ${body}
      ${attachHint}
    </div>
    <div style="padding:4px 28px 28px;border-top:1px solid #E2E8F0">
      <p style="margin:16px 0 0;font-size:13px;line-height:1.45;color:#64748B;font-family:${EMAIL_FONT}">Fragen? Antworte einfach auf diese E-Mail oder schreib an den Support über ticketfeeling.de/hilfe.</p>
    </div>
  </div>
  </div>
</body></html>`;
}

function withAccessToken(path: string, accessToken?: string | null) {
  if (!accessToken) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}t=${encodeURIComponent(accessToken)}`;
}

export type TicketMailContent = {
  subject: string;
  text: string;
  html: string;
};

export function formatEventDateForSubject(date: Date | null | undefined) {
  if (!date) return null;
  return date.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function buildOrderPaidTicketsMail(input: {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  salutation?: string | null;
  eventName: string;
  whenLabel: string;
  /** Short date for subject line, e.g. "Sa., 15. März 2027" */
  eventDateLabel?: string | null;
  locationLabel?: string | null;
  orderId: string;
  orderNumber: string;
  ticketCount: number;
  /** @deprecated Ticket PDFs are link-based; attachments are no longer used. */
  hasAttachment?: boolean;
  /** Invoice number when a Rechnung exists / was requested */
  invoiceNumber?: string | null;
  /** Absolute URL to on-demand invoice PDF (tokenized for guests) */
  invoiceDownloadUrl?: string | null;
  /** Optional first ticket id for direct wallet / PDF / calendar links in email */
  firstTicketId?: string | null;
  /** Guest access token appended to order + ticket links in email */
  accessToken?: string | null;
}): TicketMailContent {
  const greeting = formalGermanGreeting({
    gender: input.gender,
    salutation: input.salutation,
    firstName: input.firstName,
    lastName: input.lastName,
  });
  const base = appBaseUrl();
  const token = input.accessToken ?? null;
  const orderUrl = `${base}${withAccessToken(`/konto/bestellung/${input.orderId}`, token)}`;
  const place = input.locationLabel?.trim();
  const invoiceNumber = input.invoiceNumber?.trim() || null;
  const invoiceUrl = input.invoiceDownloadUrl?.trim() || null;
  const appleOn = isAppleWalletConfigured();
  const googleOn = isGoogleWalletConfigured();
  const ticketId = input.firstTicketId?.trim() || null;
  const calendarUrl = ticketId
    ? `${base}${withAccessToken(`/api/v1/tickets/${ticketId}/calendar`, token)}`
    : null;
  const appleUrl =
    appleOn && ticketId
      ? `${base}${withAccessToken(`/api/v1/tickets/${ticketId}/apple-wallet`, token)}`
      : null;
  const googleUrl =
    googleOn && ticketId
      ? `${base}${withAccessToken(`/api/v1/tickets/${ticketId}/google-wallet`, token)}`
      : null;
  const ticketCountLabel =
    input.ticketCount === 1 ? "Ihr Ticket" : `Ihre ${input.ticketCount} Tickets`;
  const invoiceLine =
    invoiceNumber && invoiceUrl
      ? `Rechnung ${invoiceNumber} können Sie jederzeit als PDF herunterladen: ${invoiceUrl}`
      : invoiceNumber
        ? `Rechnung: ${invoiceNumber}`
        : null;
  const datePart = input.eventDateLabel?.trim();
  const subject = datePart
    ? `Ihre Ticket-Bestellung – ${input.eventName} – ${datePart}`
    : `Ihre Ticket-Bestellung – ${input.eventName}`;

  const lines = [
    `${greeting},`,
    "",
    "vielen Dank für Ihre Bestellung.",
    "Wir freuen uns, dass Sie bei diesem Event dabei sind und sich Ihre Tickets gesichert haben.",
    "",
    `${ticketCountLabel} samt den QR-Codes für den Einlass können Sie auf folgendem Link einsehen, speichern oder drucken:`,
    orderUrl,
    "",
    `Event: ${input.eventName}`,
    `Termin: ${input.whenLabel}`,
    ...(place ? [`Ort: ${place}`] : []),
    `Bestellung: ${input.orderNumber}`,
    ...(invoiceLine ? [invoiceLine] : []),
    "",
    "Am Einlass einfach den QR-Code vorzeigen — digital auf dem Handy oder ausgedruckt.",
    ...(calendarUrl ? [`Termin in den Kalender eintragen: ${calendarUrl}`] : []),
    ...(appleUrl ? [`Apple Wallet: ${appleUrl}`] : []),
    ...(googleUrl ? [`Google Wallet: ${googleUrl}`] : []),
    "",
    "Ihr Ticketfeeling-Team",
  ];

  const walletHtmlButtons: string[] = [];
  // Official badge PNGs (Google DE stacked + Apple US from brand kits). Height-driven.
  if (googleUrl) {
    const src = `${base}/wallet/add-to-google-wallet.png?v=20260805b`;
    walletHtmlButtons.push(
      `<a href="${escapeHtml(googleUrl)}" style="display:inline-block;line-height:0;text-decoration:none;margin:0 10px 10px 0" target="_blank" rel="noreferrer"><img src="${escapeHtml(src)}" alt="Zu Google Wallet hinzufügen" height="40" style="height:40px;width:auto;border:0;display:block" /></a>`,
    );
  }
  if (appleUrl) {
    const src = `${base}/wallet/add-to-apple-wallet.png?v=20260805b`;
    walletHtmlButtons.push(
      `<a href="${escapeHtml(appleUrl)}" style="display:inline-block;line-height:0;text-decoration:none;margin:0 10px 10px 0"><img src="${escapeHtml(src)}" alt="Zu Apple Wallet hinzufügen" height="40" style="height:40px;width:auto;border:0;display:block" /></a>`,
    );
  }

  const htmlParas = [
    escapeHtml(`${greeting},`),
    "vielen Dank für Ihre Bestellung.<br/>Wir freuen uns, dass Sie bei diesem Event dabei sind und sich Ihre Tickets gesichert haben.",
    `${escapeHtml(ticketCountLabel)} samt den QR-Codes für den Einlass können Sie auf folgendem Link einsehen, speichern oder drucken:`,
    `<a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">Bestellung &amp; Tickets öffnen</a>`,
    `<strong style="font-size:18px">${escapeHtml(input.eventName)}</strong><br/>
     <span style="color:#334155">${escapeHtml(input.whenLabel)}</span>${
       place ? `<br/><span style="color:#334155">${escapeHtml(place)}</span>` : ""
     }<br/><span style="color:#64748B;font-size:14px">Bestellung ${escapeHtml(input.orderNumber)}${
       invoiceNumber ? ` · Rechnung ${escapeHtml(invoiceNumber)}` : ""
     }</span>`,
    "Am Einlass einfach den QR-Code vorzeigen — digital auf dem Handy oder ausgedruckt.",
    ...(calendarUrl
      ? [
          `<a href="${escapeHtml(calendarUrl)}" style="display:inline-block;background:#ffffff;color:#0F2747;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:14px;padding:11px 18px;border-radius:12px;border:1px solid #CBD5E1">Termin in den Kalender eintragen</a>`,
        ]
      : []),
    ...(invoiceUrl
      ? [
          `<a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:#ffffff;color:#0F2747;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:14px;padding:11px 18px;border-radius:12px;border:1px solid #CBD5E1">Rechnung als PDF herunterladen</a>`,
        ]
      : []),
    ...(walletHtmlButtons.length
      ? ["Tickets zum Wallet hinzufügen:", walletHtmlButtons.join("")]
      : []),
    "Ihr Ticketfeeling-Team",
  ];

  return {
    subject,
    text: lines.join("\n"),
    html: wrapHtml(htmlParas),
  };
}

export function buildTicketForwardedMail(input: {
  recipientFirstName?: string | null;
  senderName: string;
  eventName: string;
  whenLabel: string;
  locationLabel?: string | null;
  ticketNumber: string;
  seatLabel?: string | null;
  categoryLabel?: string | null;
  ticketId: string;
  orderId: string;
  hasAttachment?: boolean;
}): TicketMailContent {
  const name = input.recipientFirstName?.trim();
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  const ticketUrl = `${appBaseUrl()}/ticket/${input.ticketId}`;
  const orderUrl = `${appBaseUrl()}/konto/bestellung/${input.orderId}`;
  const hasAttachment = input.hasAttachment !== false;
  const place = input.locationLabel?.trim();
  const seat = input.seatLabel?.trim();
  const category = input.categoryLabel?.trim();

  const lines = [
    greeting,
    "",
    `${input.senderName} hat ein Ticket für dich weitergeleitet — schön, dass du dabei bist!`,
    "",
    hasAttachment
      ? "Dein Ticket liegt als PDF im Anhang. Am Einlass einfach den QR-Code vorzeigen."
      : "Öffne dein Ticket über den Link unten.",
    "",
    `Event: ${input.eventName}`,
    `Termin: ${input.whenLabel}`,
    ...(place ? [`Ort: ${place}`] : []),
    ...(category ? [`Kategorie: ${category}`] : []),
    ...(seat ? [`Platz: ${seat}`] : []),
    `Ticketnr.: ${input.ticketNumber}`,
    "",
    `Ticket öffnen: ${ticketUrl}`,
    "",
    "Bis bald — dein Ticketfeeling-Team",
  ];

  return {
    subject: `Dein Ticket für ${input.eventName}`,
    text: lines.join("\n"),
    html: wrapHtml(
      [
        escapeHtml(greeting),
        `<strong>${escapeHtml(input.senderName)}</strong> hat ein Ticket für dich weitergeleitet — schön, dass du dabei bist!`,
        hasAttachment
          ? "Dein Ticket liegt als <strong>PDF im Anhang</strong>. Am Einlass einfach den QR-Code vorzeigen."
          : "Öffne dein Ticket über den Link unten.",
        `<strong style="font-size:18px">${escapeHtml(input.eventName)}</strong><br/>
         <span style="color:#334155">${escapeHtml(input.whenLabel)}</span>${
           place ? `<br/><span style="color:#334155">${escapeHtml(place)}</span>` : ""
         }${
           category
             ? `<br/><span style="color:#64748B;font-size:14px">${escapeHtml(category)}</span>`
             : ""
         }${
           seat
             ? `<br/><span style="color:#0D9488;font-weight:600">${escapeHtml(seat)}</span>`
             : ""
         }<br/><span style="color:#64748B;font-size:14px">Ticketnr. ${escapeHtml(input.ticketNumber)}</span>`,
        `<a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">Ticket öffnen</a>`,
        `<span style="font-size:13px;color:#64748B">Bestellung: <a href="${escapeHtml(orderUrl)}" style="color:#0D9488">im Konto ansehen</a></span>`,
        "Bis bald — dein Ticketfeeling-Team",
      ],
      { hasAttachment },
    ),
  };
}

export function buildTicketsResentMail(input: {
  firstName?: string | null;
  eventName: string;
  ticketNumber: string;
  orderId: string;
  ticketId: string;
  hasAttachment?: boolean;
  accessToken?: string | null;
}): TicketMailContent {
  const name = input.firstName?.trim();
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  const base = appBaseUrl();
  const token = input.accessToken ?? null;
  const orderUrl = `${base}${withAccessToken(`/konto/bestellung/${input.orderId}`, token)}`;
  const ticketUrl = `${base}${withAccessToken(`/ticket/${input.ticketId}`, token)}`;
  const hasAttachment = input.hasAttachment !== false;

  const lines = [
    greeting,
    "",
    hasAttachment
      ? "hier ist dein Ticket erneut als PDF im Anhang."
      : "hier ist der Link zu deinem Ticket erneut.",
    "",
    `Event: ${input.eventName}`,
    `Ticketnr.: ${input.ticketNumber}`,
    "",
    `Ticket ansehen: ${ticketUrl}`,
    `Bestellung: ${orderUrl}`,
    "",
    "Dein Ticketfeeling-Team",
  ];

  return {
    subject: `Dein Ticket erneut (per Link, kein PDF-Anhang): ${input.ticketNumber}`,
    text: lines.join("\n"),
    html: wrapHtml(
      [
        escapeHtml(greeting),
        hasAttachment
          ? "hier ist dein Ticket erneut als <strong>PDF im Anhang</strong>."
          : "hier ist der Link zu deinem Ticket erneut — <strong>kein PDF-Anhang</strong>.",
        `<strong>${escapeHtml(input.eventName)}</strong><br/>Ticketnr. ${escapeHtml(input.ticketNumber)}`,
        `<a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">Ticket ansehen</a><br/><span style="font-size:13px;color:#64748B;font-family:system-ui,sans-serif;word-break:break-all"><a href="${escapeHtml(ticketUrl)}" style="color:#0D9488;text-decoration:underline">${escapeHtml(ticketUrl)}</a></span>`,
        `<a href="${escapeHtml(orderUrl)}" style="color:#0D9488;font-weight:600">Bestellung öffnen</a>`,
        "Dein Ticketfeeling-Team",
      ],
      { hasAttachment },
    ),
  };
}

export function buildSepaProcessingMail(input: {
  firstName?: string | null;
  orderNumber: string;
  orderId: string;
  eventName: string;
  whenLabel?: string | null;
  seatsLabel?: string | null;
  totalLabel: string;
  ticketsAfterConfirm: boolean;
}): TicketMailContent {
  const name = input.firstName?.trim();
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  const orderUrl = `${appBaseUrl()}/konto/bestellung/${input.orderId}`;
  const ticketHint = input.ticketsAfterConfirm
    ? "Dein Ticket erhältst du per E-Mail, sobald die Zahlung bestätigt wurde."
    : "Wir bereiten dein Ticket vor und senden es dir in Kürze zu.";

  const lines = [
    greeting,
    "",
    "vielen Dank für deine Bestellung. Der Betrag wird per Lastschrift von deinem Bankkonto eingezogen.",
    "",
    `Bestellnummer: ${input.orderNumber}`,
    `Event: ${input.eventName}`,
    ...(input.whenLabel ? [`Termin: ${input.whenLabel}`] : []),
    ...(input.seatsLabel ? [`Plätze: ${input.seatsLabel}`] : []),
    `Gesamtbetrag: ${input.totalLabel}`,
    "Zahlungsart: Lastschrift vom Bankkonto",
    "",
    "Die Zahlung wird noch verarbeitet — das ist bei Lastschrift normal und kann einige Werktage dauern.",
    ticketHint,
    "",
    `Bestellung ansehen: ${orderUrl}`,
    "",
    "Bei Fragen erreichst du uns über ticketfeeling.de/hilfe oder per Antwort auf diese E-Mail.",
    "Dein Ticketfeeling-Team",
  ];

  return {
    subject: "Deine Bestellung bei Ticketfeeling wird verarbeitet",
    text: lines.join("\n"),
    html: wrapHtml([
      escapeHtml(greeting),
      "vielen Dank für deine Bestellung. Der Betrag wird per Lastschrift von deinem Bankkonto eingezogen.",
      `<strong>Bestellnummer ${escapeHtml(input.orderNumber)}</strong><br/>
       ${escapeHtml(input.eventName)}${
         input.whenLabel ? `<br/>${escapeHtml(input.whenLabel)}` : ""
       }<br/>
       Gesamtbetrag ${escapeHtml(input.totalLabel)} · Lastschrift`,
      "Die Zahlung wird noch verarbeitet — das ist bei Lastschrift normal.",
      escapeHtml(ticketHint),
      `<a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">Bestellung ansehen</a>`,
      "Dein Ticketfeeling-Team",
    ]),
  };
}

export function buildSepaSucceededMail(input: {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  salutation?: string | null;
  eventName: string;
  whenLabel: string;
  eventDateLabel?: string | null;
  locationLabel?: string | null;
  orderId: string;
  orderNumber: string;
  ticketCount: number;
  hasAttachment?: boolean;
  invoiceNumber?: string | null;
  invoiceDownloadUrl?: string | null;
  firstTicketId?: string | null;
  accessToken?: string | null;
}): TicketMailContent {
  // Same fingerprint subject/body as card confirmations (link-only).
  return buildOrderPaidTicketsMail(input);
}

export function buildSepaFailedMail(input: {
  firstName?: string | null;
  orderNumber: string;
  orderId: string;
  eventName: string;
  reservedUntilLabel?: string | null;
  payUrl: string;
}): TicketMailContent {
  const name = input.firstName?.trim();
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  const lines = [
    greeting,
    "",
    "leider konnte die Lastschrift für deine Bestellung nicht abgeschlossen werden.",
    "",
    `Bestellnummer: ${input.orderNumber}`,
    `Event: ${input.eventName}`,
    "",
    "Deine Plätze bleiben vorerst reserviert. Du kannst die Zahlung mit einer anderen verfügbaren Zahlungsart erneut versuchen:",
    input.payUrl,
    ...(input.reservedUntilLabel
      ? [``, `Reservierung gültig bis: ${input.reservedUntilLabel}`]
      : []),
    "",
    "Bei Fragen melde dich gern über ticketfeeling.de/hilfe.",
    "Dein Ticketfeeling-Team",
  ];

  return {
    subject: "Deine Zahlung konnte nicht abgeschlossen werden",
    text: lines.join("\n"),
    html: wrapHtml([
      escapeHtml(greeting),
      "leider konnte die Lastschrift für deine Bestellung nicht abgeschlossen werden.",
      `<strong>Bestellnummer ${escapeHtml(input.orderNumber)}</strong><br/>${escapeHtml(input.eventName)}`,
      "Deine Plätze bleiben vorerst reserviert. Bitte schließe die Zahlung mit einer verfügbaren Zahlungsart ab.",
      `<a href="${escapeHtml(input.payUrl)}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">Erneut bezahlen</a>`,
      input.reservedUntilLabel
        ? `Reservierung gültig bis: ${escapeHtml(input.reservedUntilLabel)}`
        : "",
      "Dein Ticketfeeling-Team",
    ]),
  };
}

export function buildSepaDisputeMail(input: {
  firstName?: string | null;
  orderNumber: string;
  orderId: string;
  eventName: string;
  payUrl: string;
}): TicketMailContent {
  const name = input.firstName?.trim();
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  const lines = [
    greeting,
    "",
    "zu deiner Ticketzahlung liegt eine wichtige Information vor: Die Lastschrift wurde zurückgegeben oder konnte nicht eingezogen werden.",
    "",
    `Bestellnummer: ${input.orderNumber}`,
    `Event: ${input.eventName}`,
    "",
    "Dein Ticket ist deshalb derzeit nicht gültig. Bitte begleiche den offenen Betrag erneut, damit wir dir wieder Zugang zum Event freischalten können:",
    input.payUrl,
    "",
    "Wir helfen dir gern — schreib uns über ticketfeeling.de/hilfe oder antworte auf diese E-Mail.",
    "Dein Ticketfeeling-Team",
  ];

  return {
    subject: "Wichtige Information zu deiner Ticketzahlung",
    text: lines.join("\n"),
    html: wrapHtml([
      escapeHtml(greeting),
      "zu deiner Ticketzahlung liegt eine wichtige Information vor: Die Lastschrift wurde zurückgegeben oder konnte nicht eingezogen werden.",
      `<strong>Bestellnummer ${escapeHtml(input.orderNumber)}</strong><br/>${escapeHtml(input.eventName)}`,
      "Dein Ticket ist deshalb derzeit nicht gültig. Bitte begleiche den offenen Betrag erneut.",
      `<a href="${escapeHtml(input.payUrl)}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">Zahlung nachholen</a>`,
      "Dein Ticketfeeling-Team",
    ]),
  };
}

export function buildBoxOfficeTicketsMail(input: {
  firstName?: string | null;
  lastName?: string | null;
  eventName: string;
  whenLabel: string;
  ticketCount: number;
  hasAttachment?: boolean;
}): TicketMailContent {
  const full = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
  const greeting =
    !full || full === "Tageskasse Gast" ? "Guten Tag," : `Guten Tag ${full},`;
  const hasAttachment = input.hasAttachment !== false;

  const lines = [
    greeting,
    "",
    `vielen Dank für Ihren Kauf von ${input.ticketCount} Ticket${
      input.ticketCount === 1 ? "" : "s"
    } für „${input.eventName}“ (${input.whenLabel}).`,
    "",
    hasAttachment
      ? "Im Anhang finden Sie Ihre Tickets als PDF. Bitte bringen Sie den QR-Code zum Einlass mit (digital oder ausgedruckt)."
      : "Bitte öffnen Sie Ihre Tickets über Ihr Konto oder die Tageskasse.",
    "",
    "Wir freuen uns auf Sie!",
    "Ihr Ticketfeeling-Team",
  ];

  return {
    subject: `Ihre Tickets – ${input.eventName}`,
    text: lines.join("\n"),
    html: wrapHtml(
      [
        escapeHtml(greeting),
        `vielen Dank für Ihren Kauf von ${input.ticketCount} Ticket${
          input.ticketCount === 1 ? "" : "s"
        } für <strong>${escapeHtml(input.eventName)}</strong> (${escapeHtml(input.whenLabel)}).`,
        hasAttachment
          ? "Im Anhang finden Sie Ihre Tickets als PDF. Bitte bringen Sie den QR-Code zum Einlass mit (digital oder ausgedruckt)."
          : "Bitte öffnen Sie Ihre Tickets über Ihr Konto.",
        "Wir freuen uns auf Sie!<br/>Ihr Ticketfeeling-Team",
      ],
      { hasAttachment },
    ),
  };
}

type ScheduleField = {
  label: string;
  oldValue: string | null;
  newValue: string | null;
};

function scheduleFields(input: {
  oldStartsLabel: string | null;
  newStartsLabel: string | null;
  oldEndsLabel?: string | null;
  newEndsLabel?: string | null;
  oldDoorsLabel?: string | null;
  newDoorsLabel?: string | null;
}): ScheduleField[] {
  return [
    {
      label: "Beginn",
      oldValue: input.oldStartsLabel,
      newValue: input.newStartsLabel,
    },
    {
      label: "Einlass",
      oldValue: input.oldDoorsLabel ?? null,
      newValue: input.newDoorsLabel ?? null,
    },
    {
      label: "Ende",
      oldValue: input.oldEndsLabel ?? null,
      newValue: input.newEndsLabel ?? null,
    },
  ].filter((row) => row.oldValue || row.newValue);
}

function scheduleTextLine(row: ScheduleField): string {
  const { label, oldValue, newValue } = row;
  if (oldValue && newValue && oldValue !== newValue) {
    return `${label}: ${oldValue} → ${newValue}`;
  }
  if (oldValue && newValue) {
    return `${label}: ${newValue} (unverändert)`;
  }
  return `${label}: ${newValue ?? oldValue}`;
}

function scheduleChangeTableHtml(rows: ScheduleField[]): string {
  if (rows.length === 0) return "";
  const th =
    "padding:10px 12px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#64748B;text-align:left;border-bottom:1px solid #E2E8F0;font-family:" +
    EMAIL_FONT;
  const tdLabel =
    "padding:12px;font-size:14px;color:#64748B;vertical-align:top;width:22%;font-family:" +
    EMAIL_FONT;
  const tdOld =
    "padding:12px;font-size:14px;color:#64748B;vertical-align:top;width:39%;font-family:" +
    EMAIL_FONT;
  const tdNew =
    "padding:12px;font-size:14px;color:#0F2747;font-weight:600;vertical-align:top;width:39%;font-family:" +
    EMAIL_FONT;

  const body = rows
    .map((row) => {
      const changed = Boolean(
        row.oldValue && row.newValue && row.oldValue !== row.newValue,
      );
      const oldCell = row.oldValue
        ? changed
          ? `<span style="text-decoration:line-through;color:#94A3B8">${escapeHtml(row.oldValue)}</span>`
          : escapeHtml(row.oldValue)
        : "—";
      const newCell = escapeHtml(row.newValue ?? row.oldValue ?? "—");
      return `<tr>
        <td style="${tdLabel}">${escapeHtml(row.label)}</td>
        <td style="${tdOld}">${oldCell}</td>
        <td style="${tdNew}">${newCell}</td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
    <thead>
      <tr>
        <th style="${th}"></th>
        <th style="${th}">Bisher</th>
        <th style="${th}">Neu</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

/** Buyer notice when an event’s Beginn / Ende / Einlass was moved. */
export function buildScheduleChangedMail(input: {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  salutation?: string | null;
  eventName: string;
  locationLabel?: string | null;
  oldStartsLabel: string | null;
  newStartsLabel: string | null;
  oldEndsLabel?: string | null;
  newEndsLabel?: string | null;
  oldDoorsLabel?: string | null;
  newDoorsLabel?: string | null;
  eventUrl: string;
  orderUrl: string;
  orderNumber: string;
}): TicketMailContent {
  const greeting = formalGermanGreeting({
    gender: input.gender,
    salutation: input.salutation,
    firstName: input.firstName,
    lastName: input.lastName,
  });
  const place = input.locationLabel?.trim() || null;
  const base = appBaseUrl();
  const hilfeUrl = `${base}/hilfe`;
  const agbUrl = `${base}/recht/agb`;
  const rows = scheduleFields(input);
  const scheduleText = rows.map(scheduleTextLine);

  const lines = [
    `${greeting},`,
    "",
    `der Termin für „${input.eventName}“ wurde angepasst.`,
    "",
    "Was sich ändert:",
    ...scheduleText,
    ...(place ? [`Ort: ${place}`] : []),
    "",
    "Ihre Tickets bleiben für den neuen Termin gültig. Sie müssen nichts weiter tun.",
    "",
    `Bestellung ${input.orderNumber}: ${input.orderUrl}`,
    `Event-Seite: ${input.eventUrl}`,
    "",
    "Passt der neue Termin nicht? Schreiben Sie uns gern — Storno und Erstattung richten sich nach den AGB.",
    `Hilfe: ${hilfeUrl}`,
    `AGB: ${agbUrl}`,
    "",
    "Herzliche Grüße",
    "Ihr Ticketfeeling-Team",
  ];

  const placeHtml = place
    ? `<div style="margin:14px 0 0;font-size:14px;line-height:1.5;color:#334155;font-family:${EMAIL_FONT}"><span style="color:#64748B">Ort</span><br/><strong style="color:#0F2747">${escapeHtml(place)}</strong></div>`
    : "";

  return {
    subject: `Terminänderung – ${input.eventName}`,
    text: lines.join("\n"),
    html: wrapHtml([
      escapeHtml(`${greeting},`),
      `der Termin für <strong>${escapeHtml(input.eventName)}</strong> wurde angepasst.`,
      `<span style="display:block;margin:0 0 10px;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#0D9488;font-family:${EMAIL_FONT}">Was sich ändert</span>${scheduleChangeTableHtml(rows)}${placeHtml}`,
      "Ihre Tickets bleiben für den neuen Termin gültig. Sie müssen nichts weiter tun.",
      `<a href="${escapeHtml(input.orderUrl)}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;font-family:${EMAIL_FONT};font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px;margin:0 10px 10px 0">Bestellung ${escapeHtml(input.orderNumber)} öffnen</a><a href="${escapeHtml(input.eventUrl)}" style="display:inline-block;background:#ffffff;color:#0F2747;text-decoration:none;font-family:${EMAIL_FONT};font-weight:600;font-size:14px;padding:11px 18px;border-radius:12px;border:1px solid #CBD5E1;margin:0 0 10px 0">Event-Seite öffnen</a>`,
      `Passt der neue Termin nicht? Schreiben Sie uns gern über <a href="${escapeHtml(hilfeUrl)}" style="color:#0D9488">Hilfe / Kontakt</a> — Storno und Erstattung richten sich nach den <a href="${escapeHtml(agbUrl)}" style="color:#0D9488">AGB</a>.`,
      "Herzliche Grüße<br/>Ihr Ticketfeeling-Team",
    ]),
  };
}
