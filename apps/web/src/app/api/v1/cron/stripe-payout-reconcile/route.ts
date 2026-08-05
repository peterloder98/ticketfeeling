import { NextResponse } from "next/server";
import { runPayoutReconcileJob } from "@/lib/stripe-payout/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorize(request: Request): "ok" | "missing" | "unauthorized" {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return "missing";
  const auth = request.headers.get("authorization")?.trim();
  if (auth === `Bearer ${secret}`) return "ok";
  const url = new URL(request.url);
  if (url.searchParams.get("secret")?.trim() === secret) return "ok";
  return "unauthorized";
}

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
