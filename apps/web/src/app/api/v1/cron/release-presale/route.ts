import { NextResponse } from "next/server";
import { authorizeCron, cronUnauthorizedResponse } from "@/lib/cron-auth";
import { releaseDuePresales } from "@/lib/commerce/ensure-presale-release";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Flip announcement → presale_active when Vorverkaufsstart has been reached.
 * Complements effectiveEventStatus() on read so DB status stays in sync.
 * Auth: Bearer CRON_SECRET only (no query-string secret).
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (auth !== "ok") {
    const res = cronUnauthorizedResponse(auth);
    return NextResponse.json(res.body, { status: res.status });
  }

  const result = await releaseDuePresales({ take: 200 });
  return NextResponse.json({ ok: true, ...result });
}
