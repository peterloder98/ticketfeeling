import { NextResponse } from "next/server";
import { authorizeCron, cronUnauthorizedResponse } from "@/lib/cron-auth";
import { expireAndReconcileHolds } from "@/lib/commerce/cart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Expire seat holds + inventory holds on a schedule (complements cart-traffic expiry).
 * Secured with Bearer CRON_SECRET only.
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (auth !== "ok") {
    const res = cronUnauthorizedResponse(auth);
    return NextResponse.json(res.body, { status: res.status });
  }

  const started = Date.now();
  try {
    await expireAndReconcileHolds(new Date(), { forceSeatExpire: true });
    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - started,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/expire-holds]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
