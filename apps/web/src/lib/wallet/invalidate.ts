import { createSign } from "crypto";
import { prisma } from "@/lib/db";
import { getAppleWalletConfig } from "@/lib/wallet/config";
import { voidGoogleWalletObject } from "@/lib/wallet/google-pass";
import { newUpdateTag } from "@/lib/wallet/ticket-payload";

/**
 * After ticket void / cancel / full refund:
 * - Mark Apple passes voided + bump updateTag (devices pull voided .pkpass)
 * - Push APNs if configured so Wallet refreshes immediately
 * - Set Google Wallet objects to INACTIVE
 * - Revoke QR tokens if not already revoked (safety net for Stripe cancel path)
 */
export async function invalidateWalletPassesForTickets(
  ticketIds: string[],
  opts?: { revokeQr?: boolean },
) {
  const ids = [...new Set(ticketIds.filter(Boolean))];
  if (ids.length === 0) return { apple: 0, google: 0 };

  if (opts?.revokeQr !== false) {
    await prisma.ticketQrToken.updateMany({
      where: { ticketId: { in: ids }, status: "active" },
      data: { status: "revoked", revokedAt: new Date() },
    });
  }

  const now = new Date();
  const tag = newUpdateTag();

  await prisma.ticketWalletPass.updateMany({
    where: { ticketId: { in: ids }, provider: "apple" },
    data: {
      status: "voided",
      voidedAt: now,
      updateTag: tag,
    },
  });

  // Ensure Apple rows exist so web-service can serve voided passes even if never downloaded.
  for (const ticketId of ids) {
    await prisma.ticketWalletPass.upsert({
      where: { ticketId_provider: { ticketId, provider: "apple" } },
      create: {
        ticketId,
        provider: "apple",
        externalId: ticketId,
        status: "voided",
        voidedAt: now,
        updateTag: tag,
      },
      update: {},
    });
  }

  let applePushed = 0;
  for (const ticketId of ids) {
    applePushed += await pushApplePassUpdate(ticketId);
  }

  let googleOk = 0;
  for (const ticketId of ids) {
    const result = await voidGoogleWalletObject(ticketId);
    if (!result.skipped && result.ok) googleOk += 1;
  }

  return { apple: applePushed, google: googleOk };
}

/** Invalidate all active tickets on an order (refund / dispute / SEPA fail). */
export async function invalidateWalletPassesForOrder(orderId: string) {
  const tickets = await prisma.ticket.findMany({
    where: { orderId },
    select: { id: true },
  });
  return invalidateWalletPassesForTickets(tickets.map((t) => t.id));
}

/**
 * Send silent APNs push so registered devices refresh the pass.
 * Requires APPLE_PASS_APNS_KEY_* (token auth). Without it, void still works on next open/pull.
 */
async function pushApplePassUpdate(serialNumber: string): Promise<number> {
  const config = getAppleWalletConfig();
  if (!config?.apnsKeyId || !config.apnsKeyPem) return 0;

  const regs = await prisma.appleWalletDeviceRegistration.findMany({
    where: {
      serialNumber,
      passTypeIdentifier: config.passTypeIdentifier,
    },
  });
  if (regs.length === 0) return 0;

  let jwt: string;
  try {
    jwt = createApnsJwt(config.teamIdentifier, config.apnsKeyId, config.apnsKeyPem);
  } catch (error) {
    console.error("[apple-wallet] APNs JWT failed", error);
    return 0;
  }

  const host =
    process.env.APPLE_PASS_APNS_HOST?.trim() || "https://api.push.apple.com";
  let sent = 0;

  for (const reg of regs) {
    try {
      const res = await fetch(`${host}/3/device/${reg.pushToken}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": config.apnsTopic,
          "apns-push-type": "background",
          "apns-priority": "5",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (res.ok || res.status === 200) {
        sent += 1;
      } else if (res.status === 410) {
        await prisma.appleWalletDeviceRegistration.delete({ where: { id: reg.id } }).catch(() => null);
      } else {
        const body = await res.text().catch(() => "");
        console.error("[apple-wallet] APNs push failed", res.status, body);
      }
    } catch (error) {
      console.error("[apple-wallet] APNs push error", error);
    }
  }

  if (sent > 0) {
    await prisma.ticketWalletPass.updateMany({
      where: { ticketId: serialNumber, provider: "apple" },
      data: { lastPushedAt: new Date() },
    });
  }
  return sent;
}

function createApnsJwt(teamId: string, keyId: string, keyPem: string) {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }),
  ).toString("base64url");
  const data = `${header}.${body}`;
  const sign = createSign("SHA256");
  sign.update(data);
  sign.end();
  // APNs requires ES256 (P-256). Node createSign('SHA256') with EC key + dsaEncoding ieee-p1363.
  const signature = sign.sign({
    key: keyPem,
    dsaEncoding: "ieee-p1363",
  } as Parameters<typeof sign.sign>[0]);
  return `${data}.${Buffer.from(signature).toString("base64url")}`;
}
