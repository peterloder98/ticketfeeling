import Foundation
#if canImport(StripeTerminal)
import StripeTerminal
#endif

enum TapCollectError: LocalizedError {
  case stripeSdkMissing
  case connectionTokenFailed
  case readerUnavailable
  case collectFailed(String)

  var errorDescription: String? {
    switch self {
    case .stripeSdkMissing:
      return "Stripe Terminal SDK fehlt — in Xcode als SPM-Paket hinzufügen (siehe README)."
    case .connectionTokenFailed:
      return "ConnectionToken vom Server fehlgeschlagen. Handoff oder Stripe-Keys prüfen."
    case .readerUnavailable:
      return "Tap to Pay Reader nicht verfügbar. Entitlement und Stripe Location prüfen."
    case .collectFailed(let message):
      return message
    }
  }
}

/// Collects a Terminal PaymentIntent via Tap to Pay on iPhone.
/// Full reader discovery / connect flow is completed once the Stripe Terminal SPM package is linked.
final class TapToPayCollector {
  func collect(
    apiBase: URL,
    handoffToken: String?,
    clientSecret: String,
    paymentIntentId: String
  ) async throws {
    #if canImport(StripeTerminal)
    let tokenProvider = TerminalConnectionTokenProvider(apiBase: apiBase, handoffToken: handoffToken)
    // Initialize Terminal once in a real app (AppDelegate / App init).
    if Terminal.shared.connectedReader == nil {
      Terminal.setTokenProvider(tokenProvider)
    }

    // Discover + connect Tap to Pay reader (location from Dashboard / env).
    // Exact API: see https://stripe.com/docs/terminal/payments/setup-reader/tap-to-pay
    // and https://stripe.com/docs/terminal/payments/collect-card-payment
    //
    // Pseudo-complete flow (fill discovery config with your locationId from connection-token response):
    // 1) Terminal.shared.discoverReaders(...)
    // 2) Terminal.shared.connectReader(..., connectionConfig: TapToPayConnectionConfiguration(...))
    // 3) retrievePaymentIntent(clientSecret)
    // 4) collectPaymentMethod → confirmPaymentIntent

    _ = try await tokenProvider.fetchConnectionToken()
    // Retrieve PI with client secret — confirm after NFC collect:
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      Terminal.shared.retrievePaymentIntent(clientSecret: clientSecret) { intent, error in
        if let error {
          cont.resume(throwing: TapCollectError.collectFailed(error.localizedDescription))
          return
        }
        guard let intent else {
          cont.resume(throwing: TapCollectError.collectFailed("PaymentIntent fehlt"))
          return
        }
        Terminal.shared.collectPaymentMethod(intent) { collected, collectError in
          if let collectError {
            cont.resume(throwing: TapCollectError.collectFailed(collectError.localizedDescription))
            return
          }
          guard let collected else {
            cont.resume(throwing: TapCollectError.collectFailed("collectPaymentMethod leer"))
            return
          }
          Terminal.shared.confirmPaymentIntent(collected) { _, confirmError in
            if let confirmError {
              cont.resume(throwing: TapCollectError.collectFailed(confirmError.localizedDescription))
            } else {
              cont.resume()
            }
          }
        }
      }
    }
    _ = paymentIntentId
    #else
    _ = (apiBase, handoffToken, clientSecret, paymentIntentId)
    throw TapCollectError.stripeSdkMissing
    #endif
  }
}
