import { NextResponse } from "next/server";
import { authorizeTicketWalletDownload } from "@/lib/wallet/access";
import { isGoogleWalletConfigured } from "@/lib/wallet/config";
import { createGoogleWalletSaveUrl } from "@/lib/wallet/google-pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticketId: string }> };

/**
 * GET /api/v1/tickets/[ticketId]/google-wallet
 * Redirects to Google Wallet save URL (JWT), or returns JSON if ?format=json.
 */
export async function GET(request: Request, { params }: Params) {
  if (!isGoogleWalletConfigured()) {
    return NextResponse.json(
      { error: { code: "GOOGLE_WALLET_NOT_CONFIGURED" } },
      { status: 503 },
    );
  }

  const { ticketId } = await params;
  const auth = await authorizeTicketWalletDownload(ticketId, request.url);
  if (!auth.ok) {
    return NextResponse.json({ error: { code: auth.code } }, { status: auth.status });
  }

  try {
    const { saveUrl, objectId } = await createGoogleWalletSaveUrl(auth.ticketId);
    const format = new URL(request.url).searchParams.get("format");
    if (format === "json") {
      return NextResponse.json({ saveUrl, objectId });
    }
    return NextResponse.redirect(saveUrl, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status =
      message === "NOT_FOUND"
        ? 404
        : message === "NO_QR_TOKEN" || message.startsWith("GOOGLE_WALLET")
          ? 400
          : 500;
    console.error("[google-wallet] save url failed", ticketId, error);
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
