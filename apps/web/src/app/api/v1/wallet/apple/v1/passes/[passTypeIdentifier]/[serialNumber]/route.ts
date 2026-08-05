import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateApplePkpass } from "@/lib/wallet/apple-pass";
import { getAppleWalletConfig } from "@/lib/wallet/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    passTypeIdentifier: string;
    serialNumber: string;
  }>;
};

function authHeaderToken(request: Request) {
  const h = request.headers.get("authorization") || "";
  const m = /^ApplePass\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || "";
}

/** Latest .pkpass for a registered device (voided passes included). */
export async function GET(request: Request, { params }: Params) {
  const config = getAppleWalletConfig();
  const { passTypeIdentifier, serialNumber } = await params;
  if (!config || config.passTypeIdentifier !== passTypeIdentifier) {
    return new NextResponse(null, { status: 401 });
  }

  const token = authHeaderToken(request);
  const record = await prisma.ticketWalletPass.findFirst({
    where: { provider: "apple", externalId: serialNumber, authToken: token },
  });
  if (!record) return new NextResponse(null, { status: 401 });

  const ifModified = request.headers.get("if-modified-since");
  if (ifModified) {
    const since = new Date(ifModified);
    if (!Number.isNaN(since.getTime()) && record.updatedAt <= since) {
      return new NextResponse(null, { status: 304 });
    }
  }

  try {
    // serialNumber === ticketId
    const pass = await generateApplePkpass(serialNumber);
    return new NextResponse(new Uint8Array(pass.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Last-Modified": record.updatedAt.toUTCString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[apple-wallet] web-service pass fetch failed", serialNumber, error);
    return new NextResponse(null, { status: 500 });
  }
}
