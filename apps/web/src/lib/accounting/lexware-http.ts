import type { AccountingProvider, AccountingSyncStatus } from "@/lib/accounting/types";

/**
 * Lexware / Lexoffice HTTP adapter scaffold.
 * Does NOT call any remote API or invent success until credentials + client are wired.
 * Env: LEXWARE_API_KEY, LEXWARE_API_URL (optional base), LEXWARE_ORGANIZATION_ID.
 */
function readLexwareEnv() {
  const apiKey = process.env.LEXWARE_API_KEY?.trim() || "";
  const apiUrl =
    process.env.LEXWARE_API_URL?.trim() || "https://api.lexoffice.io";
  const organizationId = process.env.LEXWARE_ORGANIZATION_ID?.trim() || "";
  return { apiKey, apiUrl, organizationId };
}

export const lexwareHttpProvider: AccountingProvider & {
  isConfigured(): boolean;
} = {
  key: "lexware",
  isConfigured() {
    const { apiKey } = readLexwareEnv();
    return apiKey.length > 0;
  },
  async connect() {
    if (!this.isConfigured()) {
      return { ok: false };
    }
    // Credentials present but HTTP client not implemented yet — refuse "connected".
    return { ok: false };
  },
  async disconnect() {},
  async createInvoice() {
    throw new Error(
      "LEXWARE_NOT_IMPLEMENTED — set credentials and implement Lexoffice API client; refusing fake sync",
    );
  },
  async createCorrection() {
    throw new Error(
      "LEXWARE_NOT_IMPLEMENTED — set credentials and implement Lexoffice API client; refusing fake sync",
    );
  },
  async markPaid() {
    throw new Error("LEXWARE_NOT_IMPLEMENTED");
  },
  async getSyncStatus(): Promise<AccountingSyncStatus> {
    return "failed";
  },
  async retrySync() {
    throw new Error("LEXWARE_NOT_IMPLEMENTED");
  },
};
