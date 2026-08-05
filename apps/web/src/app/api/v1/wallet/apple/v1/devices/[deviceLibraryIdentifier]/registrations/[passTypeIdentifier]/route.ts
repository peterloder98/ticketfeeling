import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppleWalletConfig } from "@/lib/wallet/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    deviceLibraryIdentifier: string;
    passTypeIdentifier: string;
  }>;
};

/**
 * List serial numbers for passes registered to this device that updated since `passesUpdatedSince`.
 */
export async function GET(request: Request, { params }: Params) {
  const config = getAppleWalletConfig();
  const { deviceLibraryIdentifier, passTypeIdentifier } = await params;
  if (!config || config.passTypeIdentifier !== passTypeIdentifier) {
    return new NextResponse(null, { status: 401 });
  }

  const since = new URL(request.url).searchParams.get("passesUpdatedSince");
  const regs = await prisma.appleWalletDeviceRegistration.findMany({
    where: { deviceLibraryIdentifier, passTypeIdentifier },
  });
  if (regs.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const serials = regs.map((r) => r.serialNumber);
  const passes = await prisma.ticketWalletPass.findMany({
    where: {
      provider: "apple",
      externalId: { in: serials },
      ...(since
        ? { updatedAt: { gt: new Date(Number.isFinite(Number(since)) ? Number(since) : since) } }
        : {}),
    },
    select: { externalId: true, updatedAt: true },
  });

  if (passes.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const lastUpdated = passes.reduce(
    (max, p) => (p.updatedAt > max ? p.updatedAt : max),
    passes[0]!.updatedAt,
  );

  return NextResponse.json({
    lastUpdated: String(lastUpdated.getTime()),
    serialNumbers: passes.map((p) => p.externalId),
  });
}
