import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { markConsignmentTicketsSold } from "@/lib/commerce/box-office-consignment";
import { prisma } from "@/lib/db";
import { canSellAllBoxOfficeEvents } from "@/lib/commerce/box-office-access";

const schema = z.object({
  ticketIds: z.array(z.string().uuid()).optional(),
  toEmail: z.string().email().optional(),
});

type Ctx = { params: Promise<{ orderId: string }> };

/** POST — mark pre-printed consignment tickets as sold (same QR). */
export async function POST(request: Request, ctx: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
  }

  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "users:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!allowed) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { orderId } = await ctx.params;

  try {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        organizationId: membership.organizationId,
        paymentMethod: "consignment",
      },
      select: { id: true, soldByUserId: true },
    });
    if (!order) {
      return NextResponse.json({ error: { code: "ORDER_NOT_FOUND" } }, { status: 404 });
    }

    const fullAccess = await canSellAllBoxOfficeEvents(
      session.user.id,
      membership.organizationId,
    );
    if (!fullAccess && order.soldByUserId !== session.user.id) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const body = schema.parse(await request.json().catch(() => ({})));
    const result = await markConsignmentTicketsSold({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      orderId,
      ticketIds: body.ticketIds,
      toEmail: body.toEmail,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
