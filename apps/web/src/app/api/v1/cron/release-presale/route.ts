import { NextResponse } from "next/server";
import { releaseDuePresales } from "@/lib/commerce/ensure-presale-release";

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
 * Complements effectiveEventStatus() on read so DB status stays in sync.
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

  const result = await releaseDuePresales({ take: 200 });
  return NextResponse.json({ ok: true, ...result });
}
