import { NextResponse } from "next/server";
import { authorizeTicketWalletDownload } from "@/lib/wallet/access";
import { generateApplePkpass } from "@/lib/wallet/apple-pass";
import { isAppleWalletConfigured } from "@/lib/wallet/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticketId: string }> };

/**
 * GET /api/v1/tickets/[ticketId]/apple-wallet
 * Returns a signed .pkpass (Apple Wallet). Hidden in UI when not configured.
 */
export async function GET(request: Request, { params }: Params) {
  if (!isAppleWalletConfigured()) {
    return NextResponse.json(
      { error: { code: "APPLE_WALLET_NOT_CONFIGURED" } },
      { status: 503 },
    );
  }

  const { ticketId } = await params;
  const auth = await authorizeTicketWalletDownload(ticketId, request.url);
  if (!auth.ok) {
    return NextResponse.json({ error: { code: auth.code } }, { status: auth.status });
  }

  try {
    const pass = await generateApplePkpass(auth.ticketId);
    return new NextResponse(new Uint8Array(pass.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${pass.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status =
      message === "NOT_FOUND" ? 404 : message === "NO_QR_TOKEN" || message === "TICKET_INACTIVE" ? 400 : 500;
    console.error("[apple-wallet] generate failed", ticketId, error);
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
