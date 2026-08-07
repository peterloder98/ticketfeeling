import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { renderOrderTicketsPdf } from "@/lib/commerce/ticket-pdf";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { isTicketParty } from "@/lib/tickets/access";

type Params = { params: Promise<{ orderId: string }> };

/** Combined multi-ticket PDF for an order (box office print + buyer download). */
export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, tickets: { select: { id: true } } },
  });
  if (!order || order.tickets.length === 0) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  let isStaff = false;
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (membership?.organizationId === order.organizationId) {
    isStaff =
      (await userHasPermission(session.user.id, membership.organizationId, "events:read")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "audit:read")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell"));
  }

  const isBuyer = isTicketParty({
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
    orderCustomer: order.customer,
  });

  if (!isStaff && !isBuyer) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  try {
    const pdf = await renderOrderTicketsPdf(orderId);
    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
