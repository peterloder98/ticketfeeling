import { NextResponse } from "next/server";
import { authorizeCron, cronUnauthorizedResponse } from "@/lib/cron-auth";
import { runCommerceReconciliation } from "@/lib/jobs/reconcile";
import { processPendingJobs } from "@/lib/jobs/queue";
import { ensureJobHandlersRegistered } from "@/lib/jobs/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Commerce self-heal: paid→fulfill, missing emails, drain job queue, retry failed webhooks.
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
    ensureJobHandlersRegistered();
    const summary = await runCommerceReconciliation({ limit: 40 });
    // Extra drain pass for jobs enqueued during heal
    const extraJobs = await processPendingJobs({ limit: 20 });
    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - started,
      ...summary,
      extraJobs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/commerce-reconcile]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
