import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorize(request: Request): "ok" | "missing" | "unauthorized" {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return "missing";
  const auth = request.headers.get("authorization")?.trim();
  if (auth === `Bearer ${secret}`) return "ok";
  const url = new URL(request.url);
  if (url.searchParams.get("secret")?.trim() === secret) return "ok";
  return "unauthorized";
}

/**
 * Flip announcement → presale_active when Vorverkaufsstart has been reached.
 * Complements effectiveEventStatus() on read so DB status stays in sync for admin lists.
 */
export async function GET(request: Request) {
  const auth = authorize(request);
  if (auth === "missing") {
    return NextResponse.json(
      {
        error: "CRON_SECRET_NOT_CONFIGURED",
        hint: "In Vercel Environment Variables CRON_SECRET setzen und Production neu deployen.",
      },
      { status: 503 },
    );
  }
  if (auth !== "ok") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.event.findMany({
    where: {
      status: "announcement",
      presaleStartsAt: { lte: now },
    },
    select: { id: true, organizationId: true, name: true, presaleStartsAt: true },
    take: 200,
  });

  let flipped = 0;
  for (const ev of due) {
    await prisma.event.update({
      where: { id: ev.id },
      data: { status: "presale_active" },
    });
    await writeAudit({
      organizationId: ev.organizationId,
      actorUserId: null,
      action: "event.presale_auto_released",
      entityType: "event",
      entityId: ev.id,
      before: { status: "announcement", presaleStartsAt: ev.presaleStartsAt },
      after: { status: "presale_active", presaleStartsAt: ev.presaleStartsAt },
    });
    flipped += 1;
  }

  return NextResponse.json({ ok: true, checked: due.length, flipped, at: now.toISOString() });
}
