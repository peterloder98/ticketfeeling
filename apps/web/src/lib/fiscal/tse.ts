/**
 * TSE / KassenSichV adapter.
 *
 * Modes (OrganizationSettings.tseMode):
 * - none: no fiscal signing (online-only or external cash register)
 * - planned: record intent, block claiming compliance
 * - fiskaly: cloud TSE via Fiskaly (credentials in tseConfigEnc) — to be completed with API keys
 * - external: sign elsewhere; we only store references
 *
 * Cash / card_terminal at Tageskasse MUST go through signBoxOfficeSale when tseMode != none.
 */

export type FiscalSignInput = {
  organizationId: string;
  orderId: string;
  paymentId?: string;
  amountCents: number;
  currency: string;
  paymentMethod: "cash" | "card_terminal" | "card_present" | "other";
  tseMode: string;
  tseProvider?: string | null;
  tseClientId?: string | null;
  tseTssId?: string | null;
};

export type FiscalSignResult = {
  provider: string;
  status: "signed" | "recorded" | "skipped" | "failed";
  externalId?: string;
  tssId?: string;
  clientId?: string;
  processType?: string;
  signatureValue?: string;
  signatureCounter?: number;
  qrCodeData?: string;
  certificateSerial?: string;
  timeStart?: Date;
  timeEnd?: Date;
  raw?: Record<string, unknown>;
  errorMessage?: string;
};

export async function signBoxOfficeSale(input: FiscalSignInput): Promise<FiscalSignResult> {
  const mode = input.tseMode || "none";

  if (mode === "none") {
    return {
      provider: "none",
      status: "skipped",
      raw: { note: "TSE deaktiviert — Online/externe Kasse" },
    };
  }

  if (mode === "planned" || mode === "fiskaly") {
    // Until Fiskaly credentials + certified client are wired, we persist a structured
    // placeholder that is clearly NOT a legal TSE signature.
    const now = new Date();
    return {
      provider: mode === "fiskaly" ? "fiskaly" : "stub",
      status: "recorded",
      externalId: `pending_${input.orderId}`,
      tssId: input.tseTssId ?? undefined,
      clientId: input.tseClientId ?? undefined,
      processType: "RECEIPT",
      timeStart: now,
      timeEnd: now,
      qrCodeData: undefined,
      raw: {
        note:
          mode === "fiskaly"
            ? "Keine echte TSE-Signatur — Fiskaly-Modus aktiv, aber API-Credentials fehlen noch; Vorgang nur vorgemerkt."
            : "Keine echte TSE-Signatur — TSE geplant: Bar-/Kartenterminal-Verkauf erfasst, Signatur folgt nach Anbindung zertifizierter TSE (z. B. Fiskaly).",
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        compliance: false,
      },
    };
  }

  if (mode === "external") {
    return {
      provider: "external",
      status: "recorded",
      raw: {
        note: "Externe TSE/Kasse — Signatur liegt außerhalb Ticketfeeling",
        paymentMethod: input.paymentMethod,
      },
    };
  }

  return {
    provider: mode,
    status: "failed",
    errorMessage: `Unbekannter tseMode: ${mode}`,
  };
}
