import { GoogleAuth } from "google-auth-library";
import { prisma } from "@/lib/db";
import { getGoogleWalletConfig, type GoogleWalletConfig } from "@/lib/wallet/config";
import {
  formatBerlinDate,
  isTicketWalletEligible,
  loadWalletTicketPayload,
  newUpdateTag,
  type WalletTicketPayload,
} from "@/lib/wallet/ticket-payload";

const WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";

function classIdForEvent(config: GoogleWalletConfig, eventId: string) {
  const suffix = `${config.defaultClassSuffix}_${eventId.replace(/-/g, "").slice(0, 24)}`;
  return `${config.issuerId}.${suffix}`;
}

function objectIdForTicket(config: GoogleWalletConfig, ticketId: string) {
  return `${config.issuerId}.${ticketId.replace(/-/g, "")}`;
}

function authClient(config: GoogleWalletConfig) {
  return new GoogleAuth({
    credentials: {
      client_email: config.serviceAccountEmail,
      private_key: config.serviceAccountPrivateKey,
    },
    scopes: [WALLET_SCOPE],
  });
}

async function walletFetch(
  config: GoogleWalletConfig,
  method: string,
  path: string,
  body?: unknown,
) {
  const client = await authClient(config).getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("GOOGLE_WALLET_AUTH_FAILED");
  const res = await fetch(`${WALLET_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function venue(payload: WalletTicketPayload) {
  return [payload.event.locationName, payload.event.locationCity].filter(Boolean).join(", ") || undefined;
}

function buildClassBody(config: GoogleWalletConfig, payload: WalletTicketPayload) {
  const id = classIdForEvent(config, payload.event.id);
  return {
    id,
    issuerName: "Ticketfeeling",
    reviewStatus: "UNDER_REVIEW",
    eventName: {
      defaultValue: { language: "de-DE", value: payload.event.name || payload.eventNameSnapshot },
    },
    ...(payload.event.startsAt
      ? {
          dateTime: {
            start: payload.event.startsAt.toISOString(),
            ...(payload.event.endsAt ? { end: payload.event.endsAt.toISOString() } : {}),
            ...(payload.event.doorsOpenAt
              ? { doorsOpen: payload.event.doorsOpenAt.toISOString() }
              : {}),
          },
        }
      : {}),
    ...(venue(payload)
      ? {
          venue: {
            name: {
              defaultValue: {
                language: "de-DE",
                value: payload.event.locationName || venue(payload)!,
              },
            },
            ...(payload.event.locationAddress
              ? {
                  address: {
                    defaultValue: {
                      language: "de-DE",
                      value: payload.event.locationAddress,
                    },
                  },
                }
              : {}),
          },
        }
      : {}),
    hexBackgroundColor: "#0F2747",
  };
}

function buildObjectBody(
  config: GoogleWalletConfig,
  payload: WalletTicketPayload,
  classId: string,
  voided: boolean,
) {
  const id = objectIdForTicket(config, payload.ticketId);
  return {
    id,
    classId,
    state: voided ? "INACTIVE" : "ACTIVE",
    ticketHolderName: payload.holderName || undefined,
    ticketNumber: payload.ticketNumber,
    ...(payload.seatLabel || payload.seatRow || payload.seatNumber
      ? {
          seatInfo: {
            ...(payload.blockLabel
              ? {
                  gate: {
                    defaultValue: { language: "de-DE", value: payload.blockLabel },
                  },
                }
              : {}),
            ...(payload.seatRow
              ? {
                  row: {
                    defaultValue: { language: "de-DE", value: payload.seatRow },
                  },
                }
              : {}),
            ...(payload.seatNumber
              ? {
                  seat: {
                    defaultValue: { language: "de-DE", value: payload.seatNumber },
                  },
                }
              : {}),
            ...(payload.seatLabel
              ? {
                  section: {
                    defaultValue: { language: "de-DE", value: payload.categorySnapshot },
                  },
                }
              : {}),
          },
        }
      : {}),
    ticketType: {
      defaultValue: { language: "de-DE", value: payload.categorySnapshot },
    },
    barcode: payload.qrToken
      ? {
          type: "QR_CODE",
          value: payload.qrToken,
          alternateText: payload.ticketNumber,
        }
      : undefined,
    textModulesData: [
      {
        id: "order",
        header: "Bestellung",
        body: payload.orderNumber,
      },
      {
        id: "when",
        header: "Termin",
        body: formatBerlinDate(payload.event.startsAt) ?? "Termin folgt",
      },
      ...(voided
        ? [
            {
              id: "status",
              header: "Status",
              body: "Ungültig / storniert",
            },
          ]
        : []),
    ],
  };
}

/** Ensure EventTicketClass exists (idempotent). */
export async function ensureGoogleEventTicketClass(ticketId: string) {
  const config = getGoogleWalletConfig();
  if (!config) throw new Error("GOOGLE_WALLET_NOT_CONFIGURED");
  const payload = await loadWalletTicketPayload(ticketId);
  if (!payload) throw new Error("NOT_FOUND");

  const classId = classIdForEvent(config, payload.event.id);
  const existing = await walletFetch(config, "GET", `/eventTicketClass/${encodeURIComponent(classId)}`);
  if (existing.ok) return classId;

  const created = await walletFetch(
    config,
    "POST",
    "/eventTicketClass",
    buildClassBody(config, payload),
  );
  if (!created.ok && created.status !== 409) {
    console.error("[google-wallet] class create failed", created.status, created.json);
    throw new Error("GOOGLE_WALLET_CLASS_FAILED");
  }
  return classId;
}

/**
 * Upsert EventTicketObject and return an "Add to Google Wallet" save URL (JWT).
 */
export async function createGoogleWalletSaveUrl(ticketId: string): Promise<{
  saveUrl: string;
  objectId: string;
}> {
  const config = getGoogleWalletConfig();
  if (!config) throw new Error("GOOGLE_WALLET_NOT_CONFIGURED");

  const payload = await loadWalletTicketPayload(ticketId);
  if (!payload) throw new Error("NOT_FOUND");
  if (!payload.qrToken) throw new Error("NO_QR_TOKEN");

  const voided = !isTicketWalletEligible(payload.status);
  const classId = await ensureGoogleEventTicketClass(ticketId);
  const objectId = objectIdForTicket(config, payload.ticketId);
  const objectBody = buildObjectBody(config, payload, classId, voided);

  const existing = await walletFetch(
    config,
    "GET",
    `/eventTicketObject/${encodeURIComponent(objectId)}`,
  );
  if (existing.ok) {
    await walletFetch(
      config,
      "PUT",
      `/eventTicketObject/${encodeURIComponent(objectId)}`,
      objectBody,
    );
  } else {
    const created = await walletFetch(config, "POST", "/eventTicketObject", objectBody);
    if (!created.ok && created.status !== 409) {
      console.error("[google-wallet] object create failed", created.status, created.json);
      throw new Error("GOOGLE_WALLET_OBJECT_FAILED");
    }
  }

  await prisma.ticketWalletPass.upsert({
    where: { ticketId_provider: { ticketId, provider: "google" } },
    create: {
      ticketId,
      provider: "google",
      externalId: objectId,
      status: voided ? "voided" : "active",
      googleClassId: classId,
      updateTag: newUpdateTag(),
      voidedAt: voided ? new Date() : null,
    },
    update: {
      externalId: objectId,
      googleClassId: classId,
      status: voided ? "voided" : "active",
      updateTag: newUpdateTag(),
      voidedAt: voided ? new Date() : null,
    },
  });

  const claims = {
    iss: config.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    payload: {
      eventTicketObjects: [{ id: objectId }],
    },
  };

  const token = await signSaveJwt(config, claims);
  return {
    saveUrl: `https://pay.google.com/gp/v/save/${token}`,
    objectId,
  };
}

async function signSaveJwt(config: GoogleWalletConfig, claims: Record<string, unknown>) {
  // Manual RS256 JWT — google-auth JWT helper is scoped for OAuth, not savetowallet typ.
  const { createSign } = await import("crypto");
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const data = `${header}.${body}`;
  const sign = createSign("RSA-SHA256");
  sign.update(data);
  sign.end();
  const signature = sign.sign(config.serviceAccountPrivateKey).toString("base64url");
  return `${data}.${signature}`;
}

/** Mark Google object INACTIVE (void / refund). */
export async function voidGoogleWalletObject(ticketId: string) {
  const config = getGoogleWalletConfig();
  if (!config) return { skipped: true as const, reason: "not_configured" };

  const record = await prisma.ticketWalletPass.findUnique({
    where: { ticketId_provider: { ticketId, provider: "google" } },
  });
  const objectId = record?.externalId || objectIdForTicket(config, ticketId);

  const patch = await walletFetch(
    config,
    "PATCH",
    `/eventTicketObject/${encodeURIComponent(objectId)}`,
    { state: "INACTIVE" },
  );

  await prisma.ticketWalletPass.upsert({
    where: { ticketId_provider: { ticketId, provider: "google" } },
    create: {
      ticketId,
      provider: "google",
      externalId: objectId,
      status: "voided",
      voidedAt: new Date(),
      updateTag: newUpdateTag(),
      googleClassId: record?.googleClassId,
    },
    update: {
      status: "voided",
      voidedAt: new Date(),
      updateTag: newUpdateTag(),
      lastPushedAt: new Date(),
    },
  });

  if (!patch.ok && patch.status !== 404) {
    console.error("[google-wallet] void failed", ticketId, patch.status, patch.json);
    return { skipped: false as const, ok: false as const };
  }
  return { skipped: false as const, ok: true as const };
}
