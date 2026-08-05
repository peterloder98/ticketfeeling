import { readFileSync, existsSync } from "fs";
import path from "path";
import { formalGermanGreeting } from "@/lib/commerce/formal-address";
import { isAppleWalletConfigured, isGoogleWalletConfigured } from "@/lib/wallet/config";

function appBaseUrl() {
  return (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Small hosted logo for e-mail clients that allow remote images (transparent / light). */
export function emailLogoRemoteUrl() {
  return `${appBaseUrl()}/brand/logo-email.png`;
}

/**
 * Prefer a compact, freigestelltes PNG for CID embedding (heller Hintergrund, kein Schwarz).
 * CID shows in most clients without "load remote images".
 */
export function loadEmailLogoBuffer(): Buffer | null {
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

export const EMAIL_LOGO_CID = "ticketfeeling-logo";

function wrapHtml(paragraphs: string[], opts?: { hasAttachment?: boolean }) {
  const logoSrc = `cid:${EMAIL_LOGO_CID}`;
  const logoFallback = emailLogoRemoteUrl();
  const body = paragraphs
    .map((p) =>
      p
        ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#0F2747;font-family:Georgia,'Times New Roman',serif">${p}</p>`
        : "<br/>",
    )
    .join("");
  const attachHint = opts?.hasAttachment === false
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#B45309;font-family:system-ui,sans-serif">Hinweis: Die PDF-Anhänge konnten nicht erzeugt werden — öffne deine Tickets über den Link unten.</p>`
    : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EEF2F7">
  <div style="padding:28px 16px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #E2E8F0">
    <div style="background:#ffffff;padding:22px 28px 16px;text-align:center;border-bottom:1px solid #E2E8F0">
      <img src="${logoSrc}" alt="Ticketfeeling" width="200" height="auto" style="display:inline-block;max-width:200px;height:auto;border:0;background:transparent" />
      <!--[if !mso]><!-- -->
      <div style="display:none;max-height:0;overflow:hidden">
        <img src="${escapeHtml(logoFallback)}" alt="" width="1" height="1" />
      </div>
      <!--<![endif]-->
    </div>
    <div style="height:4px;background:#14B8A6"></div>
    <div style="padding:28px 28px 8px">
      ${body}
      ${attachHint}
    </div>
    <div style="padding:8px 28px 28px">
      <p style="margin:0;font-size:13px;line-height:1.45;color:#64748B;font-family:system-ui,-apple-system,sans-serif">Fragen? Antworte einfach auf diese E-Mail oder schreib an den Support über ticketfeeling.de/hilfe.</p>
    </div>
  </div>
  </div>
</body></html>`;
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
  hasAttachment?: boolean;
  /** Invoice number when a Rechnung exists / was requested */
  invoiceNumber?: string | null;
  /** Absolute URL to on-demand invoice PDF (tokenized for guests) */
  invoiceDownloadUrl?: string | null;
  /** Optional first ticket id for direct wallet deep-links in email */
  firstTicketId?: string | null;
  /** Guest access token appended to wallet API links in email */
  accessToken?: string | null;
}): TicketMailContent {
  const greeting = formalGermanGreeting({
    gender: input.gender,
    salutation: input.salutation,
    firstName: input.firstName,
    lastName: input.lastName,
  });
  const orderUrl = `${appBaseUrl()}/konto/bestellung/${input.orderId}`;
  const place = input.locationLabel?.trim();
  const hasAttachment = input.hasAttachment !== false;
  const invoiceNumber = input.invoiceNumber?.trim() || null;
  const invoiceUrl = input.invoiceDownloadUrl?.trim() || null;
  const appleOn = isAppleWalletConfigured();
  const googleOn = isGoogleWalletConfigured();
  const ticketId = input.firstTicketId?.trim() || null;
  const accessQ = input.accessToken
    ? `?t=${encodeURIComponent(input.accessToken)}`
    : "";
  const appleUrl =
    appleOn && ticketId
      ? `${appBaseUrl()}/api/v1/tickets/${ticketId}/apple-wallet${accessQ}`
      : null;
  const googleUrl =
    googleOn && ticketId
      ? `${appBaseUrl()}/api/v1/tickets/${ticketId}/google-wallet${accessQ}`
      : null;
  const walletNote =
    appleOn || googleOn
      ? "Auf dem Handy kannst du Tickets außerdem zu Apple Wallet oder Google Wallet hinzufügen — über den Link zur Bestellung."
      : null;
  const attachLine = hasAttachment
    ? "Nachfolgend finden Sie Ihre Tickets samt QR-Codes zum Einlass — als PDF im Anhang."
    : `Ihre Tickets finden Sie über den Link unten (der PDF-Anhang konnte leider nicht erzeugt werden).`;
  const invoiceLine =
    invoiceNumber && invoiceUrl
      ? `Rechnung ${invoiceNumber} können Sie jederzeit als PDF herunterladen: ${invoiceUrl}`
      : invoiceNumber
        ? `Rechnung: ${invoiceNumber}`
        : null;
  const datePart = input.eventDateLabel?.trim();
  const subject = datePart
    ? `Ihre Tickets für ${input.eventName} – ${datePart}`
    : `Ihre Tickets für ${input.eventName}`;

  const lines = [
    `${greeting},`,
    "",
    "vielen Dank für Ihre Bestellung. Wir freuen uns, dass Sie bei diesem Event dabei sind.",
    "",
    attachLine,
    "",
    `Event: ${input.eventName}`,
    `Termin: ${input.whenLabel}`,
    ...(place ? [`Ort: ${place}`] : []),
    `Bestellung: ${input.orderNumber}`,
    ...(invoiceLine ? [invoiceLine] : []),
    "",
    "Am Einlass einfach den QR-Code vorzeigen — digital auf dem Handy oder ausgedruckt.",
    ...(walletNote ? ["", walletNote] : []),
    ...(appleUrl ? [`Apple Wallet: ${appleUrl}`] : []),
    ...(googleUrl ? [`Google Wallet: ${googleUrl}`] : []),
    "",
    `Ihre Bestellung im Konto: ${orderUrl}`,
    "",
    "Ihr Ticketfeeling-Team",
  ];

  const walletHtmlButtons: string[] = [];
  if (appleUrl) {
    walletHtmlButtons.push(
      `<a href="${escapeHtml(appleUrl)}" style="display:inline-block;background:#0F2747;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:14px;padding:11px 16px;border-radius:12px;margin:0 8px 8px 0">Zu Apple Wallet</a>`,
    );
  }
  if (googleUrl) {
    walletHtmlButtons.push(
      `<a href="${escapeHtml(googleUrl)}" style="display:inline-block;background:#0F2747;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:14px;padding:11px 16px;border-radius:12px;margin:0 8px 8px 0">Zu Google Wallet</a>`,
    );
  }

  const htmlParas = [
    escapeHtml(`${greeting},`),
    "vielen Dank für Ihre Bestellung. Wir freuen uns, dass Sie bei diesem Event dabei sind.",
    hasAttachment
      ? `Nachfolgend finden Sie Ihre <strong>${
          input.ticketCount === 1 ? "Ticket-PDF" : `${input.ticketCount} Tickets`
        }</strong> samt QR-Codes zum Einlass — als <strong>PDF im Anhang</strong>.`
      : "Öffnen Sie Ihre Tickets über den Link unten.",
    `<strong style="font-size:18px">${escapeHtml(input.eventName)}</strong><br/>
     <span style="color:#334155">${escapeHtml(input.whenLabel)}</span>${
       place ? `<br/><span style="color:#334155">${escapeHtml(place)}</span>` : ""
     }<br/><span style="color:#64748B;font-size:14px">Bestellung ${escapeHtml(input.orderNumber)}${
       invoiceNumber ? ` · Rechnung ${escapeHtml(invoiceNumber)}` : ""
     }</span>`,
    "Am Einlass einfach den QR-Code vorzeigen — digital auf dem Handy oder ausgedruckt.",
    `<a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">Bestellung &amp; Tickets öffnen</a>`,
    ...(invoiceUrl
      ? [
          `<a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:#ffffff;color:#0F2747;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:14px;padding:11px 18px;border-radius:12px;border:1px solid #CBD5E1">Rechnung als PDF herunterladen</a>`,
        ]
      : []),
    ...(walletHtmlButtons.length
      ? [
          "Tickets zum Wallet hinzufügen (Anmeldung bzw. Bestellzugang nötig):",
          walletHtmlButtons.join(""),
        ]
      : []),
    "Ihr Ticketfeeling-Team",
  ];

  return {
    subject,
    text: lines.join("\n"),
    html: wrapHtml(htmlParas, { hasAttachment }),
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
}): TicketMailContent {
  const name = input.firstName?.trim();
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  const orderUrl = `${appBaseUrl()}/konto/bestellung/${input.orderId}`;
  const ticketUrl = `${appBaseUrl()}/ticket/${input.ticketId}`;
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
    subject: `Dein Ticket erneut: ${input.ticketNumber}`,
    text: lines.join("\n"),
    html: wrapHtml(
      [
        escapeHtml(greeting),
        hasAttachment
          ? "hier ist dein Ticket erneut als <strong>PDF im Anhang</strong>."
          : "hier ist der Link zu deinem Ticket erneut.",
        `<strong>${escapeHtml(input.eventName)}</strong><br/>Ticketnr. ${escapeHtml(input.ticketNumber)}`,
        `<a href="${escapeHtml(ticketUrl)}" style="color:#0D9488;font-weight:600">Ticket ansehen</a> · <a href="${escapeHtml(orderUrl)}" style="color:#0D9488;font-weight:600">Bestellung</a>`,
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
  eventName: string;
  whenLabel: string;
  eventDateLabel?: string | null;
  locationLabel?: string | null;
  orderId: string;
  orderNumber: string;
  ticketCount: number;
  hasAttachment?: boolean;
}): TicketMailContent {
  const base = buildOrderPaidTicketsMail(input);
  return {
    ...base,
    subject: "Deine Zahlung ist eingegangen – hier ist dein Ticket",
  };
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
