import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db";
import { formatDeDateTime } from "@/lib/datetime-de";
import { formatSellerAddress } from "@/lib/legal/seller";
import { buildEventOrganizerIdentity } from "@/lib/legal/event-organizer";
import { resolveTicketDoors } from "@/lib/commerce/ticket-doors";
import { qrDataUrl } from "@/lib/qr-server";

const NAVY = "#0F2747";
const TEAL = "#14B8A6";
const MUTED = "#64748B";
const INK = "#0B1421";

function formatDate(date: Date | null | undefined) {
  if (!date) return null;
  return formatDeDateTime(date, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(date: Date | null | undefined) {
  if (!date) return null;
  return date.toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function locationLines(location: {
  name: string;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
} | null) {
  if (!location) return ["—"];
  const street = [location.street, location.houseNumber].filter(Boolean).join(" ");
  const city = [location.postalCode, location.city].filter(Boolean).join(" ");
  return [location.name, street, city].filter(Boolean) as string[];
}

export async function renderTicketPdf(
  ticketId: string,
  options?: { compact?: boolean },
): Promise<{
  buffer: Buffer;
  ticketNumber: string;
  filename: string;
}> {
  const compact = options?.compact === true;
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
  const qrPx = compact ? 220 : 280;
  const qr = token ? await qrDataUrl(token, qrPx) : null;
  const dateLabel = formatDate(ticket.event.eventStartsAt);
  const startTime = formatTime(ticket.event.eventStartsAt);
  const place = locationLines(ticket.event.location);

  const doc = new PDFDocument({
    size: compact ? "A5" : "A4",
    margin: 0,
    compress: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const pad = compact ? 28 : 44;
  const contentW = pageW - pad * 2;

  doc.rect(0, 0, pageW, pageH).fill("#FFFFFF");

  const headerH = compact ? 52 : 64;
  doc.rect(0, 0, pageW, headerH).fill(NAVY);
  doc.rect(0, headerH - 4, pageW, 4).fill(TEAL);

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(compact ? 11 : 13)
    .text("TICKETFEELING", pad, compact ? 14 : 18, {
      characterSpacing: 2,
      width: contentW * 0.55,
    });
  doc
    .font("Helvetica")
    .fontSize(compact ? 8 : 9)
    .fillColor("#CBD5E1")
    .text(organizer.tradeName || organizer.displayName, pad, compact ? 32 : 38, {
      width: contentW * 0.55,
    });

  doc
    .fillColor(TEAL)
    .font("Helvetica-Bold")
    .fontSize(compact ? 9 : 10)
    .text("EINLASSTICKET", pad, compact ? 20 : 24, {
      width: contentW,
      align: "right",
    });

  let y = headerH + (compact ? 18 : 28);

  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(compact ? 18 : 24)
    .text(ticket.eventNameSnapshot, pad, y, { width: contentW });
  y = doc.y + (compact ? 8 : 12);

  // Prominent doors line
  if (doors.headline) {
    doc
      .font("Helvetica-Bold")
      .fontSize(compact ? 14 : 18)
      .fillColor(NAVY)
      .text(doors.headline, pad, y, { width: contentW });
    y = doc.y + 2;
    if (doors.doorsNote) {
      doc
        .font("Helvetica")
        .fontSize(compact ? 8 : 9)
        .fillColor(MUTED)
        .text(doors.doorsNote, pad, y, { width: contentW });
      y = doc.y + (compact ? 8 : 10);
    } else {
      y += compact ? 8 : 10;
    }
  }

  const meta = [
    dateLabel ? { label: "Datum", value: dateLabel } : null,
    startTime ? { label: "Beginn", value: `${startTime} Uhr` } : null,
    { label: "Location", value: place.join(", ") },
    { label: "Kategorie", value: ticket.categorySnapshot },
    ticket.seatLabel ? { label: "Platz", value: ticket.seatLabel } : null,
    { label: "Ticketnr.", value: ticket.ticketNumber },
  ].filter(Boolean) as { label: string; value: string }[];

  const labelW = compact ? 72 : 88;
  for (const row of meta) {
    doc
      .font("Helvetica")
      .fontSize(compact ? 8 : 9)
      .fillColor(MUTED)
      .text(row.label, pad, y, { width: labelW });
    doc
      .font("Helvetica-Bold")
      .fontSize(compact ? 9 : 10)
      .fillColor(INK)
      .text(row.value, pad + labelW, y, { width: contentW - labelW });
    y = Math.max(doc.y, y + (compact ? 14 : 16));
  }

  y += compact ? 8 : 14;

  doc
    .moveTo(pad, y)
    .lineTo(pad + contentW, y)
    .strokeColor("#E5E7EB")
    .lineWidth(1)
    .stroke();
  y += compact ? 14 : 20;

  doc
    .font("Helvetica-Bold")
    .fontSize(compact ? 9 : 10)
    .fillColor(TEAL)
    .text("QR-CODE ZUM EINLASS", pad, y, { width: contentW, align: "center" });
  y = doc.y + (compact ? 8 : 12);

  if (qr) {
    const base64 = qr.replace(/^data:image\/png;base64,/, "");
    const img = Buffer.from(base64, "base64");
    const qrDraw = compact ? 150 : 190;
    const qrX = (pageW - qrDraw) / 2;
    doc.image(img, qrX, y, { width: qrDraw, height: qrDraw });
    y += qrDraw + (compact ? 8 : 12);
  } else {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#B91C1C")
      .text("Kein gültiger QR-Code", pad, y, { width: contentW, align: "center" });
    y = doc.y + 12;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(compact ? 11 : 12)
    .fillColor(NAVY)
    .text(ticket.ticketNumber, pad, y, { width: contentW, align: "center" });
  y = doc.y + 4;

  doc
    .font("Helvetica")
    .fontSize(compact ? 8 : 9)
    .fillColor(MUTED)
    .text("Am Einlass diesen QR vorzeigen. Ausdruck oder Screenshot reicht.", pad, y, {
      width: contentW,
      align: "center",
    });

  const footerTop = pageH - (compact ? 64 : 78);
  doc
    .moveTo(pad, footerTop)
    .lineTo(pad + contentW, footerTop)
    .strokeColor("#E5E7EB")
    .lineWidth(1)
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(compact ? 7 : 8)
    .fillColor(NAVY)
    .text(`Veranstalter: ${organizer.displayName}`, pad, footerTop + 8, { width: contentW });
  doc
    .font("Helvetica")
    .fontSize(compact ? 7 : 8)
    .fillColor(MUTED)
    .text(
      [formatSellerAddress(organizer), organizer.supportEmail ?? organizer.email ?? ""]
        .filter(Boolean)
        .join(" · "),
      pad,
      doc.y + 2,
      { width: contentW },
    );
  doc
    .font("Helvetica")
    .fontSize(compact ? 6 : 7)
    .fillColor(MUTED)
    .text("Ticketfeeling", pad, pageH - (compact ? 14 : 16), {
      width: contentW,
      align: "right",
    });

  doc.end();
  const buffer = await done;
  return {
    buffer,
    ticketNumber: ticket.ticketNumber,
    filename: `${ticket.ticketNumber}.pdf`,
  };
}

/** One multi-page PDF for all tickets of an order (e-mail attachment). */
export async function renderOrderTicketsPdf(orderId: string): Promise<{
  buffer: Buffer;
  filename: string;
  ticketCount: number;
}> {
  const tickets = await prisma.ticket.findMany({
    where: { orderId },
    orderBy: { ticketNumber: "asc" },
    select: { id: true, ticketNumber: true, order: { select: { orderNumber: true } } },
  });
  if (tickets.length === 0) throw new Error("NO_TICKETS");

  if (tickets.length === 1) {
    const single = await renderTicketPdf(tickets[0]!.id, { compact: true });
    return {
      buffer: single.buffer,
      filename: `${tickets[0]!.order.orderNumber}-tickets.pdf`,
      ticketCount: 1,
    };
  }

  const fullTickets = await prisma.ticket.findMany({
    where: { orderId },
    orderBy: { ticketNumber: "asc" },
    include: {
      event: { include: { location: true } },
      category: true,
      holder: true,
      qrTokens: { where: { status: "active" }, take: 1 },
      organization: { include: { settings: true } },
      order: true,
    },
  });

  const doc = new PDFDocument({ size: "A5", margin: 0, compress: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  for (let i = 0; i < fullTickets.length; i += 1) {
    const ticket = fullTickets[i]!;
    if (i > 0) doc.addPage({ size: "A5", margin: 0 });

    const organizer = buildEventOrganizerIdentity(
      ticket.organization,
      ticket.organization.settings,
      ticket.event,
    );
    const doors = resolveTicketDoors(ticket.event, ticket.category);
    const token = ticket.qrTokens[0]?.token ?? "";
    const qr = token ? await qrDataUrl(token, 220) : null;
    const dateLabel = formatDate(ticket.event.eventStartsAt);
    const startTime = formatTime(ticket.event.eventStartsAt);
    const place = locationLines(ticket.event.location);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const pad = 28;
    const contentW = pageW - pad * 2;
    const headerH = 52;

    doc.rect(0, 0, pageW, pageH).fill("#FFFFFF");
    doc.rect(0, 0, pageW, headerH).fill(NAVY);
    doc.rect(0, headerH - 4, pageW, 4).fill(TEAL);
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("TICKETFEELING", pad, 14, { characterSpacing: 2, width: contentW * 0.55 });
    doc
      .fillColor(TEAL)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`TICKET ${i + 1}/${fullTickets.length}`, pad, 20, {
        width: contentW,
        align: "right",
      });

    let y = headerH + 16;
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(ticket.eventNameSnapshot, pad, y, { width: contentW });
    y = doc.y + 8;

    if (doors.headline) {
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(NAVY)
        .text(doors.headline, pad, y, { width: contentW });
      y = doc.y + 2;
      if (doors.doorsNote) {
        doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(doors.doorsNote, pad, y, {
          width: contentW,
        });
        y = doc.y + 6;
      } else {
        y += 6;
      }
    }

    const meta = [
      dateLabel ? { label: "Datum", value: dateLabel } : null,
      startTime ? { label: "Beginn", value: `${startTime} Uhr` } : null,
      { label: "Location", value: place.join(", ") },
      { label: "Kategorie", value: ticket.categorySnapshot },
      ticket.seatLabel ? { label: "Platz", value: ticket.seatLabel } : null,
      { label: "Ticketnr.", value: ticket.ticketNumber },
    ].filter(Boolean) as { label: string; value: string }[];

    for (const row of meta) {
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(row.label, pad, y, { width: 72 });
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(INK)
        .text(row.value, pad + 72, y, { width: contentW - 72 });
      y = Math.max(doc.y, y + 14);
    }

    y += 8;
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(TEAL)
      .text("QR-CODE ZUM EINLASS", pad, y, { width: contentW, align: "center" });
    y = doc.y + 8;

    if (qr) {
      const img = Buffer.from(qr.replace(/^data:image\/png;base64,/, ""), "base64");
      const qrDraw = 130;
      doc.image(img, (pageW - qrDraw) / 2, y, { width: qrDraw, height: qrDraw });
    }

    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        `Veranstalter: ${organizer.displayName} · ${formatSellerAddress(organizer)}`,
        pad,
        pageH - 36,
        { width: contentW, align: "center" },
      );
    doc
      .font("Helvetica")
      .fontSize(6)
      .fillColor(MUTED)
      .text("Ticketfeeling", pad, pageH - 18, { width: contentW, align: "right" });
  }

  doc.end();
  const buffer = await done;
  const orderNumber = fullTickets[0]!.order.orderNumber;
  return {
    buffer,
    filename: `${orderNumber}-tickets.pdf`,
    ticketCount: fullTickets.length,
  };
}
