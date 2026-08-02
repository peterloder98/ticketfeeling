import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  emailBoxOfficeTickets,
  markBoxOfficePrinted,
} from "@/lib/commerce/box-office-delivery";

const schema = z.object({
  orderId: z.string().uuid(),
  action: z.enum(["print", "email"]),
  toEmail: z.string().email().optional(),
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
    if (body.action === "print") {
      const result = await markBoxOfficePrinted({
        orderId: body.orderId,
        organizationId: membership.organizationId,
        actorUserId: session.user.id,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    const result = await emailBoxOfficeTickets({
      orderId: body.orderId,
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      toEmail: body.toEmail,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
