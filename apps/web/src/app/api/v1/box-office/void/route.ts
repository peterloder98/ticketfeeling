import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { voidBoxOfficeOrder } from "@/lib/commerce/box-office-void";

const schema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().max(500).optional(),
  /** Optional: void only these tickets; omit for whole order. */
  ticketIds: z.array(z.string().uuid()).min(1).max(200).optional(),
});

export async function POST(request: Request) {
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
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!allowed) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  try {
    const body = schema.parse(await request.json());
    const result = await voidBoxOfficeOrder({
      orderId: body.orderId,
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      reason: body.reason,
      ticketIds: body.ticketIds,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "FORBIDDEN" || message === "DELIVERED_NEEDS_ADMIN" ? 403 : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
