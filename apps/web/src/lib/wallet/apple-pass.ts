import { PKPass } from "passkit-generator";
import { prisma } from "@/lib/db";
import { getAppleWalletConfig } from "@/lib/wallet/config";
import { buildApplePassImageBuffers } from "@/lib/wallet/pass-assets";
import {
  formatBerlinDate,
  isTicketWalletEligible,
  loadWalletTicketPayload,
  newAppleAuthToken,
  newUpdateTag,
  type WalletTicketPayload,
} from "@/lib/wallet/ticket-payload";

export type ApplePassResult = {
  buffer: Buffer;
  filename: string;
  serialNumber: string;
  authenticationToken: string;
};

function venueLine(payload: WalletTicketPayload) {
  return [payload.event.locationName, payload.event.locationCity].filter(Boolean).join(", ") || "—";
}

function seatLine(payload: WalletTicketPayload) {
  return payload.seatLabel?.trim() || payload.categorySnapshot;
}

/**
 * Build a signed .pkpass for one ticket. Reuses the active QR token as barcode message.
 * Requires Apple Pass Type ID certificates in env — see .env.example.
 */
export async function generateApplePkpass(ticketId: string): Promise<ApplePassResult> {
  const config = getAppleWalletConfig();
  if (!config) {
    throw new Error("APPLE_WALLET_NOT_CONFIGURED");
  }

  const payload = await loadWalletTicketPayload(ticketId, { includeRevokedQr: true });
  if (!payload) throw new Error("NOT_FOUND");

  const voided = !isTicketWalletEligible(payload.status);
  // Active tickets need a live QR; voided passes may reuse the last token only for display.
  if (!payload.qrToken && !voided) throw new Error("NO_QR_TOKEN");
  const barcodeMessage = payload.qrToken || payload.ticketNumber;
  const serialNumber = payload.ticketId;

  let record = await prisma.ticketWalletPass.findUnique({
    where: { ticketId_provider: { ticketId, provider: "apple" } },
  });

  const authToken = record?.authToken || newAppleAuthToken();
  const updateTag = newUpdateTag();

  if (!record) {
    record = await prisma.ticketWalletPass.create({
      data: {
        ticketId,
        provider: "apple",
        externalId: serialNumber,
        authToken,
        status: voided ? "voided" : "active",
        updateTag,
        voidedAt: voided ? new Date() : null,
      },
    });
  } else {
    record = await prisma.ticketWalletPass.update({
      where: { id: record.id },
      data: {
        authToken: record.authToken || authToken,
        updateTag,
        status: voided ? "voided" : record.status === "voided" ? "voided" : "active",
        voidedAt: voided ? record.voidedAt ?? new Date() : record.voidedAt,
      },
    });
  }

  const images = await buildApplePassImageBuffers();
  const whenLabel = formatBerlinDate(payload.event.startsAt) ?? "Termin folgt";
  const relevantDate = payload.event.startsAt?.toISOString();
  const expirationDate =
    payload.event.endsAt?.toISOString() ??
    (payload.event.startsAt
      ? new Date(payload.event.startsAt.getTime() + 12 * 60 * 60 * 1000).toISOString()
      : undefined);

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    serialNumber,
    teamIdentifier: config.teamIdentifier,
    organizationName: "Ticketfeeling",
    description: `Ticket: ${payload.eventNameSnapshot}`,
    logoText: "Ticketfeeling",
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: "rgb(15, 39, 71)",
    labelColor: "rgb(20, 184, 166)",
    webServiceURL: `${config.webServiceUrl}/v1`,
    authenticationToken: record.authToken || authToken,
    ...(relevantDate ? { relevantDate } : {}),
    ...(expirationDate ? { expirationDate } : {}),
    ...(voided ? { voided: true } : {}),
    eventTicket: {
      headerFields: [
        {
          key: "date",
          label: "TERMIN",
          value: whenLabel,
        },
      ],
      primaryFields: [
        {
          key: "event",
          label: "EVENT",
          value: payload.eventNameSnapshot,
        },
      ],
      secondaryFields: [
        {
          key: "venue",
          label: "ORT",
          value: venueLine(payload),
        },
        {
          key: "seat",
          label: "PLATZ",
          value: seatLine(payload),
        },
      ],
      auxiliaryFields: [
        {
          key: "ticket",
          label: "TICKETNR.",
          value: payload.ticketNumber,
        },
        ...(payload.holderName
          ? [
              {
                key: "holder",
                label: "INHABER",
                value: payload.holderName,
              },
            ]
          : []),
      ],
      backFields: [
        {
          key: "order",
          label: "Bestellung",
          value: payload.orderNumber,
        },
        {
          key: "status",
          label: "Status",
          value: voided ? "Ungültig / storniert" : "Gültig zum Einlass",
        },
        {
          key: "hint",
          label: "Hinweis",
          value: voided
            ? "Dieses Ticket ist nicht mehr gültig."
            : "Am Einlass den QR-Code vorzeigen. Bei Storno wird dieses Pass aktualisiert.",
        },
      ],
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: barcodeMessage,
        messageEncoding: "iso-8859-1",
        altText: voided ? `${payload.ticketNumber} (ungültig)` : payload.ticketNumber,
      },
    ],
  };

  const buffers: Record<string, Buffer> = {
    ...images,
    "pass.json": Buffer.from(JSON.stringify(passJson), "utf8"),
  };

  const pass = new PKPass(buffers, {
    wwdr: config.wwdrPem,
    signerCert: config.signerCertPem,
    signerKey: config.signerKeyPem,
    ...(config.signerKeyPassphrase
      ? { signerKeyPassphrase: config.signerKeyPassphrase }
      : {}),
  });

  const buffer = pass.getAsBuffer();
  const safeName = payload.ticketNumber.replace(/[^a-zA-Z0-9_-]+/g, "_");

  return {
    buffer,
    filename: `Ticketfeeling-${safeName}.pkpass`,
    serialNumber,
    authenticationToken: record.authToken || authToken,
  };
}
