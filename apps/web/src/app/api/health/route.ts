import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPublicAppUrl } from "@/lib/embed/public-url";
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

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

async function smtpConfigured(): Promise<boolean> {
  try {
    const [accountCount, settingsWithSmtp] = await Promise.all([
      prisma.organizationEmailAccount.count(),
      prisma.organizationSettings.count({
        where: {
          smtpHost: { not: null },
        },
      }),
    ]);
    return accountCount > 0 || settingsWithSmtp > 0;
  } catch {
    return false;
  }
}

export async function GET() {
  const gitSha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ||
    null;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim() || null;
  const resolvedAppUrl = getPublicAppUrl();
  const appHost = hostnameOnly(resolvedAppUrl);

  try {
    await prisma.$queryRaw`SELECT 1`;
    const smtpOk = await smtpConfigured();
    const warnings: string[] = [];
    if (isProductionRuntime() && !smtpOk) {
      const msg =
        "SMTP missing in production — ticket emails will stub (configure org email account)";
      warnings.push(msg);
      console.error("[health] KRITISCH:", msg);
    }

    return NextResponse.json({
      ok: true,
      service: "ticketfeeling",
      db: "up",
      time: new Date().toISOString(),
      gitSha,
      deploymentId,
      appHost,
      smtp: smtpOk ? "configured" : "missing",
      warnings: warnings.length ? warnings : undefined,
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
