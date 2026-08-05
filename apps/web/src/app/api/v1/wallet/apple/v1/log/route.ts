import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Apple PassKit log endpoint (devices POST debug logs here). */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (process.env.APPLE_PASS_LOG_VERBOSE === "1") {
      console.info("[apple-wallet] device log", body.slice(0, 4000));
    }
  } catch {
    /* ignore */
  }
  return new NextResponse(null, { status: 200 });
}
