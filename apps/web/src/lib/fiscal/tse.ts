/**
 * TSE / KassenSichV adapter.
 *
 * Modes (OrganizationSettings.tseMode):
 * - none: no fiscal signing (online-only or external cash register)
 * - planned: record intent, block claiming compliance
 * - fiskaly: cloud TSE via Fiskaly — real signing only when FISKALY_* + org ids present
 * - external: sign elsewhere; we only store references
 *
 * Cash / card_terminal at Tageskasse MUST go through signBoxOfficeSale when tseMode != none.
 *
 * Never set compliance:true or status:"signed" until a real TSE signature is obtained.
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
  /** Must include `compliance: false` until a certified signature exists. */
  raw?: Record<string, unknown> & { compliance?: boolean };
  errorMessage?: string;
};

/** Env + org fields needed for a real Fiskaly client (scaffold readiness check). */
export function isFiskalyConfigured(input?: {
  tseClientId?: string | null;
  tseTssId?: string | null;
}): boolean {
  const apiKey = process.env.FISKALY_API_KEY?.trim();
  const apiSecret = process.env.FISKALY_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return false;
  const clientId =
    input?.tseClientId?.trim() || process.env.FISKALY_CLIENT_ID?.trim();
  const tssId = input?.tseTssId?.trim() || process.env.FISKALY_TSS_ID?.trim();
  return Boolean(clientId && tssId);
}

/**
 * Pluggable TSE backend. Fiskaly implementation stays a stub until keys + certified client exist.
 */
export type TseSigner = {
  readonly key: string;
  sign(input: FiscalSignInput): Promise<FiscalSignResult>;
};

function recordedPlaceholder(
  input: FiscalSignInput,
  provider: string,
  note: string,
): FiscalSignResult {
  const now = new Date();
  return {
    provider,
    status: "recorded",
    externalId: `pending_${input.orderId}`,
    tssId: input.tseTssId?.trim() || process.env.FISKALY_TSS_ID?.trim() || undefined,
    clientId:
      input.tseClientId?.trim() || process.env.FISKALY_CLIENT_ID?.trim() || undefined,
    processType: "RECEIPT",
    timeStart: now,
    timeEnd: now,
    qrCodeData: undefined,
    signatureValue: undefined,
    raw: {
      note,
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod,
      // Explicit: never claim KassenSichV compliance from a stub.
      compliance: false,
      fiskalyEnvPresent: isFiskalyConfigured({
        tseClientId: input.tseClientId,
        tseTssId: input.tseTssId,
      }),
    },
  };
}

/**
 * Fiskaly cloud TSE — scaffold only.
 * Even with FISKALY_* set, we do not invent signatures; status stays "recorded".
 */
export const fiskalyTseSigner: TseSigner = {
  key: "fiskaly",
  async sign(input) {
    const ready = isFiskalyConfigured({
      tseClientId: input.tseClientId,
      tseTssId: input.tseTssId,
    });
    return recordedPlaceholder(
      input,
      "fiskaly",
      ready
        ? "Keine echte TSE-Signatur — Fiskaly-Credentials vorhanden, HTTP-Client/zertifizierte Anbindung noch nicht implementiert; Vorgang nur vorgemerkt."
        : "Keine echte TSE-Signatur — Fiskaly-Modus aktiv, aber API-Credentials fehlen noch; Vorgang nur vorgemerkt.",
    );
  },
};

export const plannedTseSigner: TseSigner = {
  key: "stub",
  async sign(input) {
    return recordedPlaceholder(
      input,
      "stub",
      "Keine echte TSE-Signatur — TSE geplant: Bar-/Kartenterminal-Verkauf erfasst, Signatur folgt nach Anbindung zertifizierter TSE (z. B. Fiskaly).",
    );
  },
};

export function resolveTseSigner(tseMode: string): TseSigner | null {
  const mode = tseMode || "none";
  if (mode === "fiskaly") return fiskalyTseSigner;
  if (mode === "planned") return plannedTseSigner;
  return null;
}

export async function signBoxOfficeSale(
  input: FiscalSignInput,
): Promise<FiscalSignResult> {
  const mode = input.tseMode || "none";

  if (mode === "none") {
    return {
      provider: "none",
      status: "skipped",
      raw: { note: "TSE deaktiviert — Online/externe Kasse", compliance: false },
    };
  }

  const signer = resolveTseSigner(mode);
  if (signer) {
    const result = await signer.sign(input);
    // Hard guard: stubs must never claim signed/compliance.
    if (result.status === "signed" && result.raw?.compliance !== true) {
      return {
        ...result,
        status: "recorded",
        signatureValue: undefined,
        qrCodeData: undefined,
        raw: { ...result.raw, compliance: false, demotedFromSigned: true },
      };
    }
    if (result.raw && result.raw.compliance !== true) {
      result.raw = { ...result.raw, compliance: false };
    }
    return result;
  }

  if (mode === "external") {
    return {
      provider: "external",
      status: "recorded",
      raw: {
        note: "Externe TSE/Kasse — Signatur liegt außerhalb Ticketfeeling",
        paymentMethod: input.paymentMethod,
        compliance: false,
      },
    };
  }

  return {
    provider: mode,
    status: "failed",
    errorMessage: `Unbekannter tseMode: ${mode}`,
    raw: { compliance: false },
  };
}
