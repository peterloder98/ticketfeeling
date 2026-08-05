import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  isAppleWalletConfigured,
  isGoogleWalletConfigured,
} from "@/lib/wallet/config";

function hostnameOnly(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const gitSha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ||
    null;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim() || null;
  const appHost =
    hostnameOnly(process.env.APP_URL) ||
    hostnameOnly(process.env.NEXTAUTH_URL) ||
    hostnameOnly(process.env.AUTH_URL);

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: "ticketfeeling",
      db: "up",
      time: new Date().toISOString(),
      gitSha,
      deploymentId,
      appHost,
      wallet: {
        apple: isAppleWalletConfigured(),
        google: isGoogleWalletConfigured(),
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "ticketfeeling",
        db: "down",
        time: new Date().toISOString(),
        gitSha,
        deploymentId,
        appHost,
        wallet: {
          apple: isAppleWalletConfigured(),
          google: isGoogleWalletConfigured(),
        },
      },
      { status: 503 },
    );
  }
}
