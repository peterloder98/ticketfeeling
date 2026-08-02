import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

const openSchema = z.object({
  openingCashEuros: z.number().min(0).default(0),
  notes: z.string().max(2000).optional(),
});

const closeSchema = z.object({
  sessionId: z.string().uuid(),
  closingCashEuros: z.number().min(0),
  notes: z.string().max(2000).optional(),
});

async function assertKasseAccess(userId: string, organizationId: string) {
  return (
    (await userHasPermission(userId, organizationId, "box_office:sell")) ||
    (await userHasPermission(userId, organizationId, "box_office:close")) ||
    (await userHasPermission(userId, organizationId, "org:write"))
  );
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
  if (!(await assertKasseAccess(session.user.id, membership.organizationId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const open = await prisma.boxOfficeSession.findFirst({
    where: { organizationId: membership.organizationId, status: "open" },
    orderBy: { openedAt: "desc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cashSales = await prisma.payment.aggregate({
    where: {
      organizationId: membership.organizationId,
      provider: "box_office",
      method: "cash",
      status: "paid",
      paidAt: { gte: today },
    },
    _sum: { amountCents: true },
  });

  return NextResponse.json({
    openSession: open,
    cashSalesTodayCents: cashSales._sum.amountCents ?? 0,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
  if (!(await assertKasseAccess(session.user.id, membership.organizationId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = openSchema.parse(await request.json());
  const existing = await prisma.boxOfficeSession.findFirst({
    where: { organizationId: membership.organizationId, status: "open" },
  });
  if (existing) {
    return NextResponse.json({ error: { code: "SESSION_ALREADY_OPEN" }, session: existing }, { status: 400 });
  }

  const created = await prisma.boxOfficeSession.create({
    data: {
      organizationId: membership.organizationId,
      openedByUserId: session.user.id,
      openingCashCents: Math.round(body.openingCashEuros * 100),
      notes: body.notes,
      status: "open",
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "box_office.session.opened",
    entityType: "box_office_session",
    entityId: created.id,
    after: { openingCashCents: created.openingCashCents },
  });

  return NextResponse.json({ session: created });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
  if (!(await assertKasseAccess(session.user.id, membership.organizationId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = closeSchema.parse(await request.json());
  const open = await prisma.boxOfficeSession.findFirst({
    where: {
      id: body.sessionId,
      organizationId: membership.organizationId,
      status: "open",
    },
  });
  if (!open) return NextResponse.json({ error: { code: "SESSION_NOT_FOUND" } }, { status: 404 });

  const cashSinceOpen = await prisma.payment.aggregate({
    where: {
      organizationId: membership.organizationId,
      provider: "box_office",
      method: "cash",
      status: "paid",
      paidAt: { gte: open.openedAt },
    },
    _sum: { amountCents: true },
  });

  const expected = open.openingCashCents + (cashSinceOpen._sum.amountCents ?? 0);
  const closing = Math.round(body.closingCashEuros * 100);
  const closed = await prisma.boxOfficeSession.update({
    where: { id: open.id },
    data: {
      status: "closed",
      closedByUserId: session.user.id,
      closedAt: new Date(),
      closingCashCents: closing,
      expectedCashCents: expected,
      differenceCents: closing - expected,
      notes: body.notes ?? open.notes,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "box_office.session.closed",
    entityType: "box_office_session",
    entityId: closed.id,
    after: {
      closingCashCents: closed.closingCashCents,
      expectedCashCents: closed.expectedCashCents,
      differenceCents: closed.differenceCents,
    },
  });

  return NextResponse.json({ session: closed });
}
