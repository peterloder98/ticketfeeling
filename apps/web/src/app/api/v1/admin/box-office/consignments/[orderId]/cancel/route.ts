import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { cancelBoxOfficeConsignmentRemaining } from "@/lib/commerce/box-office-consignment";

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

type Ctx = { params: Promise<{ orderId: string }> };

/** POST — storno remaining active tickets on a consignment allocation. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requirePartnerAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { session, membership } = auth as {
    session: { user: { id: string } };
    membership: { organizationId: string };
  };
  const { orderId } = await ctx.params;

  try {
    const result = await cancelBoxOfficeConsignmentRemaining({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      orderId,
    });
    return NextResponse.json({
      ok: true,
      voidedTicketIds: result.voidedTicketIds,
      orderCancelled: result.orderCancelled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "ORDER_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
