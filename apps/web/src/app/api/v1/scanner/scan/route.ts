import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { scanTicket, technicalScanErrorResult } from "@/lib/commerce/checkin";
import { ensureSaleClosedEarlyColumn } from "@/lib/commerce/ensure-sale-closed-early";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

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
    await ensureSaleClosedEarlyColumn();
    const event = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: membership.organizationId },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: { code: "EVENT_NOT_FOUND" } }, { status: 404 });
    }

    try {
      const result = await scanTicket({
        ...body,
        actorUserId: session.user.id,
        deviceLabel: body.deviceLabel?.trim() || "web-scanner",
      });
      return NextResponse.json(result);
    } catch (scanError) {
      console.error("[scanner/scan] technical", scanError);
      // Never surface as INVALID — door staff must retry, not refuse entry on infra blips.
      return NextResponse.json(technicalScanErrorResult(), { status: 503 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION" } }, { status: 400 });
    }
    console.error("[scanner/scan]", error);
    return NextResponse.json(technicalScanErrorResult(), { status: 503 });
  }
}
