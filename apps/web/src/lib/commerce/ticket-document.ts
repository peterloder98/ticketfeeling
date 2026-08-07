import { prisma } from "@/lib/db";
import { formatDeDateTime } from "@/lib/datetime-de";
import { formatSellerAddress } from "@/lib/legal/seller";
import { buildEventOrganizerIdentity } from "@/lib/legal/event-organizer";
import { resolveTicketDoors } from "@/lib/commerce/ticket-doors";
import { qrDataUrl } from "@/lib/qr-server";

/** Server-generated printable HTML ticket (PDF engine can wrap this later). */
export async function renderTicketHtml(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: { include: { location: true } },
      category: true,
      holder: true,
      qrTokens: { where: { status: "active" }, take: 1 },
      organization: { include: { settings: true } },
      order: true,
    },
  });
  if (!ticket) throw new Error("TICKET_NOT_FOUND");

  const organizer = buildEventOrganizerIdentity(
    ticket.organization,
    ticket.organization.settings,
    ticket.event,
  );
  const doors = resolveTicketDoors(ticket.event, ticket.category);
  const token = ticket.qrTokens[0]?.token ?? "";
  const qr = token ? await qrDataUrl(token, 280) : null;
  const startLabel = ticket.event.eventStartsAt
    ? formatDeDateTime(ticket.event.eventStartsAt)
    : "—";

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(ticket.ticketNumber)}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; color: #0B1421; margin: 0; padding: 24px; background: #fff; }
    .card { border: 1px solid #E5E7EB; border-radius: 12px; padding: 24px; max-width: 480px; }
    .brand { letter-spacing: .18em; text-transform: uppercase; font-size: 11px; color: #0F2747; font-weight: 700; }
    h1 { margin: 10px 0 8px; font-size: 24px; color: #0F2747; }
    .doors { font-size: 20px; font-weight: 700; color: #0F2747; margin: 8px 0 2px; }
    .doors-note { font-size: 12px; color: #64748B; margin-bottom: 12px; }
    .meta { font-size: 14px; line-height: 1.55; }
    .meta div { margin: 2px 0; }
    .qr { margin-top: 20px; padding: 12px; background: #F8FAFC; border-radius: 12px; text-align: center; }
    .qr img { width: 220px; height: 220px; }
    .token { margin-top: 8px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 10px; color: #64748B; }
    .seller { margin-top: 20px; font-size: 12px; color: #334155; }
    .tf { margin-top: 8px; font-size: 10px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Ticketfeeling</div>
    <h1>${escapeHtml(ticket.eventNameSnapshot)}</h1>
    ${
      doors.headline
        ? `<div class="doors">${escapeHtml(doors.headline)}</div>${
            doors.doorsNote
              ? `<div class="doors-note">${escapeHtml(doors.doorsNote)}</div>`
              : ""
          }`
        : ""
    }
    <div class="meta">
      <div><strong>Beginn:</strong> ${escapeHtml(startLabel)}</div>
      <div><strong>Location:</strong> ${escapeHtml(
        ticket.event.location
          ? `${ticket.event.location.name}, ${ticket.event.location.city ?? ""}`
          : "—",
      )}</div>
      <div><strong>Kategorie:</strong> ${escapeHtml(ticket.categorySnapshot)}</div>
      ${
        ticket.seatLabel
          ? `<div><strong>Platz:</strong> ${escapeHtml(ticket.seatLabel)}</div>`
          : ""
      }
      <div><strong>Ticketnr.:</strong> ${escapeHtml(ticket.ticketNumber)}</div>
      <div><strong>Inhaber:</strong> ${escapeHtml(
        `${ticket.holder?.firstName ?? ""} ${ticket.holder?.lastName ?? ""}`.trim(),
      )}</div>
      <div><strong>Bestellung:</strong> ${escapeHtml(ticket.order.orderNumber)}</div>
    </div>
    <div class="qr">
      <strong>QR zum Einlass</strong><br/>
      ${qr ? `<img src="${qr}" alt="QR-Code" />` : "kein Token"}
      <div class="token">${escapeHtml(token)}</div>
    </div>
    <div class="seller">
      Veranstalter: ${escapeHtml(organizer.displayName)}<br/>
      ${escapeHtml(formatSellerAddress(organizer))}<br/>
      ${escapeHtml(organizer.supportEmail ?? organizer.email ?? "")}
    </div>
    <div class="tf">Ticketfeeling</div>
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
