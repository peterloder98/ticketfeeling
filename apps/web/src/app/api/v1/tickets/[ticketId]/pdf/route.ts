import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { renderTicketPdf } from "@/lib/commerce/ticket-pdf";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { canUseTicketEntry, isTicketParty } from "@/lib/tickets/access";

type Params = { params: Promise<{ ticketId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { ticketId } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { holder: true, order: { include: { customer: true } } },
  });
  if (!ticket) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  let isStaff = false;
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (membership?.organizationId === ticket.organizationId) {
    isStaff =
      (await userHasPermission(session.user.id, membership.organizationId, "events:read")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell"));
  }

  const canViewOrder = isTicketParty({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
    holder: ticket.holder,
    orderCustomer: ticket.order.customer,
  });
  if (!isStaff && !canViewOrder) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  // After forwarding: only current holder (or staff) may download the entry PDF.
  const canEntry = canUseTicketEntry({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
    holder: ticket.holder,
    isStaff,
  });
  if (!canEntry) {
    return NextResponse.json({ error: { code: "TICKET_TRANSFERRED" } }, { status: 403 });
  }

  try {
    const pdf = await renderTicketPdf(ticketId);
    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
