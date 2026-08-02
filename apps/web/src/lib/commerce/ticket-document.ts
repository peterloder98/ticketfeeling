import { prisma } from "@/lib/db";
import { buildSellerIdentity, formatSellerAddress } from "@/lib/legal/seller";
import { qrDataUrl } from "@/lib/qr-server";

/** Server-generated printable HTML ticket (PDF engine can wrap this later). */
export async function renderTicketHtml(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: { include: { location: true } },
      holder: true,
      qrTokens: { where: { status: "active" }, take: 1 },
      organization: { include: { settings: true } },
      order: true,
    },
  });
  if (!ticket) throw new Error("TICKET_NOT_FOUND");

  const seller = buildSellerIdentity(ticket.organization, ticket.organization.settings);
  const token = ticket.qrTokens[0]?.token ?? "";
  const qr = token ? await qrDataUrl(token, 280) : null;

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${ticket.ticketNumber}</title>
  <style>
    body { font-family: Georgia, serif; color: #111; margin: 0; padding: 24px; }
    .card { border: 2px solid #c9a45a; border-radius: 16px; padding: 24px; max-width: 480px; }
    .brand { letter-spacing: .2em; text-transform: uppercase; font-size: 12px; color: #8a6a2b; }
    h1 { margin: 8px 0 16px; font-size: 28px; }
    .meta { font-size: 14px; line-height: 1.5; }
    .qr { margin-top: 20px; padding: 12px; background: #f6f1e7; border-radius: 12px; text-align: center; }
    .qr img { width: 220px; height: 220px; }
    .token { margin-top: 8px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 10px; color: #555; }
    .seller { margin-top: 20px; font-size: 12px; color: #444; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Ticketfeeling</div>
    <h1>${escapeHtml(ticket.eventNameSnapshot)}</h1>
    <div class="meta">
      <div><strong>Kategorie:</strong> ${escapeHtml(ticket.categorySnapshot)}</div>
      <div><strong>Beginn:</strong> ${ticket.event.eventStartsAt ? ticket.event.eventStartsAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "—"}</div>
      <div><strong>Location:</strong> ${escapeHtml(ticket.event.location ? `${ticket.event.location.name}, ${ticket.event.location.city ?? ""}` : "—")}</div>
      <div><strong>Ticketnr.:</strong> ${escapeHtml(ticket.ticketNumber)}</div>
      <div><strong>Inhaber:</strong> ${escapeHtml(`${ticket.holder?.firstName ?? ""} ${ticket.holder?.lastName ?? ""}`.trim())}</div>
      <div><strong>Bestellung:</strong> ${escapeHtml(ticket.order.orderNumber)}</div>
    </div>
    <div class="qr">
      <strong>QR zum Einlass</strong><br/>
      ${qr ? `<img src="${qr}" alt="QR-Code" />` : "kein Token"}
      <div class="token">${escapeHtml(token)}</div>
    </div>
    <div class="seller">
      Verkäufer / Veranstalter: ${escapeHtml(seller.displayName)}<br/>
      ${escapeHtml(formatSellerAddress(seller))}<br/>
      ${escapeHtml(seller.supportEmail ?? seller.email ?? "")}
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
