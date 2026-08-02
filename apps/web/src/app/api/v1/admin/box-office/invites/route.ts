import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { createBoxOfficeInvite } from "@/lib/commerce/box-office-invite";

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  eventIds: z.array(z.string().uuid()).min(1),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
  }
  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "users:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!allowed) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const invites = await prisma.boxOfficeInvite.findMany({
    where: { organizationId: membership.organizationId },
    include: {
      events: { include: { event: { select: { id: true, name: true } } } },
      invitedBy: { select: { email: true, name: true } },
      acceptedUser: { select: { email: true, name: true } },
    },
    orderBy: { invitedAt: "desc" },
    take: 100,
  });

  const grants = await prisma.boxOfficeSellerGrant.findMany({
    where: { organizationId: membership.organizationId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      event: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    invites: invites.map((inv) => ({
      ...inv,
      acceptPath: inv.status === "pending" ? `/einladung/${inv.token}` : null,
    })),
    grants,
  });
}

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
    (await userHasPermission(session.user.id, membership.organizationId, "users:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!allowed) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  try {
    const body = createSchema.parse(await request.json());
    const invite = await createBoxOfficeInvite({
      organizationId: membership.organizationId,
      invitedByUserId: session.user.id,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      eventIds: body.eventIds,
    });
    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        email: invite.email,
        status: invite.status,
        expiresAt: invite.expiresAt,
        acceptPath: `/einladung/${invite.token}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
