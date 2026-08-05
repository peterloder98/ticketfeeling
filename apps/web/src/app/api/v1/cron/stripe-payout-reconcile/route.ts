import { NextResponse } from "next/server";
import { runPayoutReconcileJob } from "@/lib/stripe-payout/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "monthly" ? "monthly" : "daily";
  const lookbackDays =
    kind === "monthly"
      ? Number(url.searchParams.get("days") ?? 120)
      : Number(url.searchParams.get("days") ?? 45);

  try {
    const result = await runPayoutReconcileJob({ kind, lookbackDays });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
