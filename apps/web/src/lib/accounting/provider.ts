import type { AccountingProvider } from "@/lib/accounting/types";
import { lexwareStubProvider } from "@/lib/accounting/lexware-stub";
import { lexwareHttpProvider } from "@/lib/accounting/lexware-http";

/**
 * Resolve the active AccountingProvider.
 *
 * Until the Lexoffice HTTP client is production-ready, always use the stub
 * unless LEXWARE_ENABLED=1 and LEXWARE_API_KEY are set. The HTTP scaffold
 * refuses fake success (throws) — fulfillment catches that so payments stay safe.
 */
export function getAccountingProvider(): AccountingProvider {
  if (
    process.env.LEXWARE_ENABLED?.trim() === "1" &&
    lexwareHttpProvider.isConfigured()
  ) {
    return lexwareHttpProvider;
  }
  return lexwareStubProvider;
}

export function isLexwareConfigured(): boolean {
  return (
    process.env.LEXWARE_ENABLED?.trim() === "1" &&
    lexwareHttpProvider.isConfigured()
  );
}
