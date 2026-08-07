import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEmbedFrameAncestors, getPublicAppUrl } from "@/lib/embed/public-url";
import { isRedisRateLimitConfigured } from "@/lib/security/rate-limit";
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

async function opsSnapshot() {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      queuePending,
      queueDead,
      queueNeedsAttention,
      lastWebhook,
      failedWebhooks24h,
      needsReviewOrders,
      bouncedEmails24h,
      autoHealed24h,
    ] = await Promise.all([
      prisma.backgroundJob.count({ where: { status: "pending" } }).catch(() => -1),
      prisma.backgroundJob.count({ where: { status: "dead_letter" } }).catch(() => -1),
      prisma.backgroundJob.count({ where: { status: "needs_attention" } }).catch(() => -1),
      prisma.webhookInbox
        .findFirst({
          where: { provider: "stripe" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, status: true, providerEventId: true },
        })
        .catch(() => null),
      prisma.webhookInbox
        .count({
          where: {
            provider: "stripe",
            status: "failed",
            createdAt: { gte: since24h },
          },
        })
        .catch(() => -1),
      prisma.order.count({ where: { paymentStatus: "needs_review" } }).catch(() => -1),
      prisma.emailDelivery
        .count({ where: { status: "BOUNCED", createdAt: { gte: since24h } } })
        .catch(() => -1),
      prisma.auditLog
        .count({
          where: {
            action: { in: ["reconcile.commerce_run", "order.fulfilled"] },
            createdAt: { gte: since24h },
          },
        })
        .catch(() => -1),
    ]);

    return {
      queue: {
        pending: queuePending,
        deadLetter: queueDead,
        needsAttention: queueNeedsAttention,
      },
      webhooks: {
        lastAt: lastWebhook?.createdAt?.toISOString() ?? null,
        lastStatus: lastWebhook?.status ?? null,
        failed24h: failedWebhooks24h,
      },
      ordersNeedsReview: needsReviewOrders,
      emailBounced24h: bouncedEmails24h,
      autoProcessedSignals24h: autoHealed24h,
    };
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
  const resolvedAppUrl = getPublicAppUrl();
  const appHost = hostnameOnly(resolvedAppUrl);
  const embedFrameAncestors = getEmbedFrameAncestors();
  const embedAllowlistOpen = embedFrameAncestors.includes("*");

  try {
    await prisma.$queryRaw`SELECT 1`;
    const smtpOk = await smtpConfigured();
    const ops = await opsSnapshot();
    const warnings: string[] = [];
    if (isProductionRuntime() && !smtpOk) {
      const msg =
        "SMTP missing in production — ticket emails will stub (configure org email account)";
      warnings.push(msg);
      console.error("[health] KRITISCH:", msg);
    }
    if (isProductionRuntime() && embedAllowlistOpen) {
      const msg =
        "EMBED_FRAME_ANCESTORS unset or * — embeds allow any parent origin (set allowlist to tighten)";
      warnings.push(msg);
      console.warn("[health]", msg);
    }
    const rateLimitBackend = isRedisRateLimitConfigured() ? "redis" : "memory";
    if (isProductionRuntime() && rateLimitBackend === "memory") {
      const msg =
        "Rate limits use in-memory Map — link Upstash Redis / Vercel KV for multi-instance limits";
      warnings.push(msg);
      console.warn("[health]", msg);
    }
    if (ops && ops.queue.deadLetter > 0) {
      warnings.push(`Job dead-letter queue depth: ${ops.queue.deadLetter}`);
    }
    if (ops && ops.ordersNeedsReview > 0) {
      warnings.push(`Orders needing review: ${ops.ordersNeedsReview}`);
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
      embedFrameAncestors,
      rateLimit: rateLimitBackend,
      ops,
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
        embedFrameAncestors,
        wallet: {
          apple: isAppleWalletConfigured(),
          google: isGoogleWalletConfigured(),
        },
      },
      { status: 503 },
    );
  }
}
