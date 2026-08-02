export type AccountingSyncStatus =
  | "not_required"
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "needs_review";

/**
 * AccountingProvider — Lexware Office implements this later.
 * Ticketfeeling DB remains source of truth for sales.
 */
export interface AccountingProvider {
  readonly key: string;
  connect(): Promise<{ ok: boolean }>;
  disconnect(): Promise<void>;
  createInvoice(input: { invoiceId: string }): Promise<{ externalId: string }>;
  createCorrection(input: { correctionId: string }): Promise<{ externalId: string }>;
  markPaid(input: { invoiceId: string; paymentId: string }): Promise<void>;
  getSyncStatus(input: { invoiceId: string }): Promise<AccountingSyncStatus>;
  retrySync(input: { invoiceId: string }): Promise<void>;
}
