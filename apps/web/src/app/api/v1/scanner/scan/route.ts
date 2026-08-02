import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { scanTicket } from "@/lib/commerce/checkin";
import { prisma } from "@/lib/db";

const schema = z.object({
  eventId: z.string().uuid(),
  token: z.string().min(10),
  action: z.enum(["in", "out", "info"]).optional(),
  deviceLabel: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }

    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (!membership) {
      return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
    }

    const allowed =
      (await userHasPermission(session.user.id, membership.organizationId, "checkin:scan")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
      (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
    if (!allowed) {
      return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }

    const body = schema.parse(await request.json());
    const event = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: membership.organizationId },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
    }

    const result = await scanTicket({
      ...body,
      actorUserId: session.user.id,
      deviceLabel: body.deviceLabel?.trim() || "web-scanner",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
