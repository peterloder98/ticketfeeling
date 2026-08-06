import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  allocateBoxOfficeConsignment,
  listBoxOfficeConsignments,
} from "@/lib/commerce/box-office-consignment";

const allocateSchema = z.object({
  partnerUserId: z.string().uuid(),
  eventId: z.string().uuid(),
  categoryId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
});

async function requirePartnerAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 }) };
  }
  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "users:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!allowed) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  return { session, membership };
}

export async function GET() {
  const auth = await requirePartnerAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { membership } = auth as { membership: { organizationId: string } };
  const consignments = await listBoxOfficeConsignments(membership.organizationId);
  return NextResponse.json({ consignments });
}

export async function POST(request: Request) {
  const auth = await requirePartnerAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { session, membership } = auth as {
    session: { user: { id: string } };
    membership: { organizationId: string };
  };

  try {
    const body = allocateSchema.parse(await request.json());
    const sale = await allocateBoxOfficeConsignment({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      partnerUserId: body.partnerUserId,
      eventId: body.eventId,
      categoryId: body.categoryId,
      quantity: body.quantity,
    });
    return NextResponse.json({
      ok: true,
      orderId: sale.orderId,
      orderNumber: sale.orderNumber,
      pdfPath: `/api/v1/orders/${sale.orderId}/pdf`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status =
      message === "PARTNER_NOT_FOUND" || message === "EVENT_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
