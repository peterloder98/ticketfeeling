import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppleWalletConfig } from "@/lib/wallet/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    deviceLibraryIdentifier: string;
    passTypeIdentifier: string;
    serialNumber: string;
  }>;
};

function authHeaderToken(request: Request) {
  const h = request.headers.get("authorization") || "";
  const m = /^ApplePass\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || "";
}

async function verifyPassAuth(serialNumber: string, passTypeIdentifier: string, token: string) {
  const config = getAppleWalletConfig();
  if (!config || config.passTypeIdentifier !== passTypeIdentifier) return false;
  if (!token) return false;
  const record = await prisma.ticketWalletPass.findFirst({
    where: {
      provider: "apple",
      externalId: serialNumber,
      authToken: token,
    },
  });
  return Boolean(record);
}

/** Register device for pass updates */
export async function POST(request: Request, { params }: Params) {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await params;
  const token = authHeaderToken(request);
  if (!(await verifyPassAuth(serialNumber, passTypeIdentifier, token))) {
    return new NextResponse(null, { status: 401 });
  }

  let pushToken = "";
  try {
    const body = (await request.json()) as { pushToken?: string };
    pushToken = body.pushToken?.trim() || "";
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!pushToken) return new NextResponse(null, { status: 400 });

  await prisma.appleWalletDeviceRegistration.upsert({
    where: {
      deviceLibraryIdentifier_passTypeIdentifier_serialNumber: {
        deviceLibraryIdentifier,
        passTypeIdentifier,
        serialNumber,
      },
    },
    create: {
      deviceLibraryIdentifier,
      passTypeIdentifier,
      serialNumber,
      pushToken,
    },
    update: { pushToken },
  });

  return new NextResponse(null, { status: 201 });
}

/** Unregister device */
export async function DELETE(_request: Request, { params }: Params) {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = await params;
  // Apple may omit auth on some delete paths; still scope delete tightly.
  await prisma.appleWalletDeviceRegistration.deleteMany({
    where: { deviceLibraryIdentifier, passTypeIdentifier, serialNumber },
  });
  return new NextResponse(null, { status: 200 });
}
