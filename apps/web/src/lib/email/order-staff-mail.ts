import { promises as dns } from "dns";
import { prisma } from "@/lib/db";
import { paymentMethodLabel, channelLabel } from "@/lib/commerce/channels";
import { formatEuroFromCents } from "@/lib/money";
import { EMAIL_LOGO_CID, emailBrandHeaderHtml } from "@/lib/email/ticket-mail";
import { resolveOutboundSmtp } from "@/lib/email/accounts";

import { getPublicAppUrl } from "@/lib/embed/public-url";

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

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.endsWith("@ticketfeeling.local");
}

/** Seed / placeholder org contacts — never use as staff notify unless explicitly set in orderNotificationEmail. */
const PLACEHOLDER_ORG_NOTIFY_EMAILS = new Set([
  "info@ticketfeeling.de",
  "support@ticketfeeling.de",
]);

function isPlaceholderOrgNotifyEmail(email: string) {
  return PLACEHOLDER_ORG_NOTIFY_EMAILS.has(email.trim().toLowerCase());
}

function emailsFromSettingsData(data: unknown): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const raw = (data as Record<string, unknown>).orderNotificationEmail;
  if (typeof raw === "string") {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(isEmail);
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.trim().toLowerCase())
      .filter(isEmail);
  }
  return [];
}

const domainMxCache = new Map<string, { ok: boolean; checkedAt: number }>();
const DOMAIN_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * True when the mailbox domain has MX (preferred) or at least an A/AAAA record.
 * Avoids staff notify bounces to placeholder addresses on dead / misconfigured domains.
 */
export async function isEmailDomainDeliverable(email: string): Promise<boolean> {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain || domain === "ticketfeeling.local") return false;

  const cached = domainMxCache.get(domain);
  if (cached && Date.now() - cached.checkedAt < DOMAIN_CACHE_TTL_MS) {
    return cached.ok;
  }

  let ok = false;
  try {
    const mx = await dns.resolveMx(domain);
    ok = Array.isArray(mx) && mx.length > 0;
  } catch {
    ok = false;
  }
  if (!ok) {
    try {
      const a = await dns.resolve4(domain);
      ok = Array.isArray(a) && a.length > 0;
    } catch {
      try {
        const aaaa = await dns.resolve6(domain);
        ok = Array.isArray(aaaa) && aaaa.length > 0;
      } catch {
        ok = false;
      }
    }
  }

  domainMxCache.set(domain, { ok, checkedAt: Date.now() });
  return ok;
}

async function filterDeliverable(emails: string[]): Promise<string[]> {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(isEmail))];
  const live: string[] = [];
  for (const email of unique) {
    if (await isEmailDomainDeliverable(email)) live.push(email);
    else {
      console.warn("[order-staff-mail] skip non-deliverable notification address", email);
    }
  }
  return live;
}

/**
 * Resolve who should receive „Neue Bestellung“ staff notifications.
 * Priority (first source with live/deliverable addresses wins):
 * settings.data.orderNotificationEmail → SMTP from → supportEmail →
 * settings.email → active organizer_admin / system_admin members.
 *
 * Addresses on domains without MX/A are skipped so placeholder
 * info@ticketfeeling.de (etc.) cannot bounce when DNS is incomplete.
 */
export async function resolveOrderNotificationRecipients(
  organizationId: string,
): Promise<{ to: string[]; source: string; skipped: string[] }> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { email: true, supportEmail: true, data: true },
  });

  const skipped: string[] = [];
  const trySource = async (
    source: string,
    candidates: string[],
  ): Promise<{ to: string[]; source: string; skipped: string[] } | null> => {
    const unique = [...new Set(candidates.map((e) => e.trim().toLowerCase()).filter(isEmail))];
    if (!unique.length) return null;
    const live = await filterDeliverable(unique);
    for (const e of unique) {
      if (!live.includes(e)) skipped.push(e);
    }
    if (live.length) return { to: live, source, skipped };
    return null;
  };

  const envNotify = (process.env.ORDER_NOTIFICATION_EMAIL ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(isEmail);
  const hitEnv = await trySource("env.ORDER_NOTIFICATION_EMAIL", envNotify);
  if (hitEnv) return hitEnv;

  const fromData = emailsFromSettingsData(settings?.data);
  const hitData = await trySource("settings.data.orderNotificationEmail", fromData);
  if (hitData) return hitData;

  let smtpFrom: string | null = null;
  try {
    const smtp = await resolveOutboundSmtp(organizationId);
    smtpFrom = smtp?.fromEmail?.trim().toLowerCase() || null;
  } catch {
    smtpFrom = null;
  }
  if (smtpFrom && isEmail(smtpFrom)) {
    const hitSmtp = await trySource("smtp.fromEmail", [smtpFrom]);
    if (hitSmtp) return hitSmtp;
  }

  const support = settings?.supportEmail?.trim().toLowerCase();
  if (support && !isPlaceholderOrgNotifyEmail(support)) {
    const hitSupport = await trySource("settings.supportEmail", [support]);
    if (hitSupport) return hitSupport;
  } else if (support) {
    skipped.push(support);
  }

  const orgEmail = settings?.email?.trim().toLowerCase();
  if (orgEmail && !isPlaceholderOrgNotifyEmail(orgEmail)) {
    const hitOrg = await trySource("settings.email", [orgEmail]);
    if (hitOrg) return hitOrg;
  } else if (orgEmail) {
    skipped.push(orgEmail);
  }

  const memberships = await prisma.membership.findMany({
    where: {
      organizationId,
      status: "active",
      roles: {
        some: {
          role: { key: { in: ["organizer_admin", "system_admin"] } },
        },
      },
    },
    include: { user: { select: { email: true } } },
  });

  const adminEmails = memberships.map((m) => m.user.email.trim().toLowerCase());
  const hitAdmins = await trySource("organizer_admin", adminEmails);
  if (hitAdmins) return hitAdmins;

  return { to: [], source: "none", skipped };
}

export type StaffOrderCategoryLine = {
  name: string;
  quantity: number;
  grossCents: number;
};

export type StaffOrderMailInput = {
  orderId: string;
  orderNumber: string;
  channel?: string | null;
  eventName: string;
  whenLabel: string;
  locationLabel?: string | null;
  buyerName: string;
  buyerEmail: string;
  /**
   * Staff who completed a Tageskasse sale (soldByUser).
   * Always shown for box_office channel.
   */
  sellerName?: string | null;
  sellerEmail?: string | null;
  ticketCount: number;
  categories: StaffOrderCategoryLine[];
  totalCents: number;
  currency?: string;
  paymentMethod?: string | null;
  invoiceNumber?: string | null;
  invoiceId?: string | null;
  /** Absolute URL — staff opens while logged in */
  invoiceDownloadUrl?: string | null;
};

export type TicketMailContent = {
  subject: string;
  text: string;
  html: string;
};

function wrapStaffHtml(bodyInner: string) {
  const logoSrc = `cid:${EMAIL_LOGO_CID}`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EEF2F7">
  <div style="padding:28px 16px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #E2E8F0">
    <div style="background:#ffffff;padding:22px 28px 16px;text-align:center;border-bottom:1px solid #E2E8F0">
      ${emailBrandHeaderHtml(logoSrc)}
    </div>
    <div style="height:4px;background:#14B8A6"></div>
    <div style="padding:28px 28px 8px">
      ${bodyInner}
    </div>
    <div style="padding:8px 28px 28px">
      <p style="margin:0;font-size:13px;line-height:1.45;color:#64748B;font-family:system-ui,-apple-system,sans-serif">Diese Benachrichtigung geht an euer Team — nicht an den Käufer.</p>
    </div>
  </div>
  </div>
</body></html>`;
}

function formatSellerLabel(input: StaffOrderMailInput): string | null {
  const name = input.sellerName?.trim() || null;
  const email = input.sellerEmail?.trim() || null;
  if (name && email && name.toLowerCase() !== email.toLowerCase()) {
    return `${name} (${email})`;
  }
  return name || email || null;
}

export function buildOrderStaffNotificationMail(input: StaffOrderMailInput): TicketMailContent {
  const isBoxOffice = input.channel === "box_office";
  const orderUrl = isBoxOffice
    ? `${appBaseUrl()}/kasse/beleg/${input.orderId}`
    : `${appBaseUrl()}/admin/orders/${input.orderId}`;
  const totalLabel = formatEuroFromCents(input.totalCents, input.currency ?? "EUR");
  const payLabel = paymentMethodLabel(input.paymentMethod);
  const channel = channelLabel(input.channel);
  const place = input.locationLabel?.trim() || null;
  const invoiceNumber = input.invoiceNumber?.trim() || null;
  const invoiceUrl = input.invoiceDownloadUrl?.trim() || null;
  const sellerLabel = formatSellerLabel(input);
  const showSeller = isBoxOffice || Boolean(sellerLabel);

  const categoryLines = input.categories.map(
    (c) =>
      `${c.quantity}× ${c.name} (${formatEuroFromCents(c.grossCents, input.currency ?? "EUR")})`,
  );
  const categoryText =
    categoryLines.length > 0 ? categoryLines.join("\n") : `${input.ticketCount} Ticket(s)`;

  const subject = isBoxOffice
    ? `Tageskasse-Verkauf: ${input.eventName} · ${input.orderNumber}`
    : `Neue Bestellung: ${input.eventName} · ${input.orderNumber}`;

  const textLines = [
    isBoxOffice ? "Neuer Tageskasse-Verkauf" : "Neue Bestellung eingegangen",
    "",
    `Event: ${input.eventName}`,
    `Termin: ${input.whenLabel}`,
    ...(place ? [`Ort: ${place}`] : []),
    "",
    `Käufer: ${input.buyerName}`,
    `E-Mail: ${input.buyerEmail}`,
    ...(showSeller
      ? [`Verkäufer: ${sellerLabel ?? "nicht zugeordnet"}`]
      : []),
    "",
    `Tickets: ${input.ticketCount}`,
    "Kategorien:",
    categoryText,
    "",
    `Gesamtbetrag: ${totalLabel}`,
    `Zahlungsart: ${payLabel}`,
    `Kanal: ${channel}`,
    `Bestellung: ${input.orderNumber}`,
    ...(invoiceNumber ? [`Rechnung: ${invoiceNumber}`] : []),
    ...(invoiceUrl ? [`Rechnung als PDF herunterladen: ${invoiceUrl}`] : []),
    "",
    isBoxOffice ? `Beleg öffnen: ${orderUrl}` : `Im Admin öffnen: ${orderUrl}`,
    "",
    "Ticketfeeling",
  ];

  const categoryRows = input.categories
    .map(
      (c) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:14px;color:#0F2747">${escapeHtml(String(c.quantity))}× ${escapeHtml(c.name)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:14px;color:#0F2747;text-align:right;white-space:nowrap">${escapeHtml(formatEuroFromCents(c.grossCents, input.currency ?? "EUR"))}</td>
        </tr>`,
    )
    .join("");

  const sellerRow = showSeller
    ? `<tr>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:13px;color:#64748B">Verkäufer</td>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:15px;color:#0F2747">${escapeHtml(sellerLabel ?? "nicht zugeordnet")}</td>
      </tr>`
    : "";

  const bodyInner = `
    <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#0D9488;font-family:system-ui,sans-serif;font-weight:600">${isBoxOffice ? "Tageskasse" : "Neue Bestellung"}</p>
    <p style="margin:0 0 20px;font-size:22px;line-height:1.35;color:#0F2747;font-family:system-ui,sans-serif;font-weight:700">Es ist was verkauft worden.</p>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#0F2747;font-family:Georgia,'Times New Roman',serif">
      <strong style="font-size:18px;font-family:system-ui,sans-serif">${escapeHtml(input.eventName)}</strong><br/>
      <span style="color:#334155">${escapeHtml(input.whenLabel)}</span>
      ${place ? `<br/><span style="color:#334155">${escapeHtml(place)}</span>` : ""}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse">
      <tr>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:13px;color:#64748B;width:38%">Käufer</td>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:15px;color:#0F2747">${escapeHtml(input.buyerName)}<br/><span style="font-size:13px;color:#64748B">${escapeHtml(input.buyerEmail)}</span></td>
      </tr>
      ${sellerRow}
      <tr>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:13px;color:#64748B">Tickets</td>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:15px;color:#0F2747">${input.ticketCount}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:13px;color:#64748B;vertical-align:top">Kategorien</td>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${categoryRows || `<tr><td style="font-family:system-ui,sans-serif;font-size:14px;color:#0F2747">${input.ticketCount} Ticket(s)</td></tr>`}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:13px;color:#64748B">Gesamt</td>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:18px;font-weight:700;color:#0F2747">${escapeHtml(totalLabel)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:13px;color:#64748B">Zahlung</td>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:15px;color:#0F2747">${escapeHtml(payLabel)} · ${escapeHtml(channel)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:13px;color:#64748B">Bestellung</td>
        <td style="padding:10px 0;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;font-family:system-ui,sans-serif;font-size:15px;color:#0F2747">${escapeHtml(input.orderNumber)}${invoiceNumber ? ` · Rechnung ${escapeHtml(invoiceNumber)}` : ""}</td>
      </tr>
    </table>
    <p style="margin:0 0 12px">
      <a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#14B8A6;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">${isBoxOffice ? "Beleg in der Tageskasse öffnen" : "Bestellung im Admin öffnen"}</a>
    </p>
    ${
      invoiceUrl
        ? `<p style="margin:0 0 16px"><a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:#ffffff;color:#0F2747;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;font-size:14px;padding:11px 18px;border-radius:12px;border:1px solid #CBD5E1">Rechnung als PDF herunterladen</a></p>`
        : ""
    }
  `;

  return {
    subject,
    text: textLines.join("\n"),
    html: wrapStaffHtml(bodyInner),
  };
}
