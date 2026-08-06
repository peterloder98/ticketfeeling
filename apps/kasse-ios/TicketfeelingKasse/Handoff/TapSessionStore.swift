import Foundation
import Combine

struct TapHandoff {
  let orderId: String
  let paymentIntentId: String
  let clientSecret: String
  let handoffToken: String?
  let apiBase: URL
}

@MainActor
final class TapSessionStore: ObservableObject {
  @Published var handoff: TapHandoff?
  @Published var isCollecting = false
  @Published var statusMessage: String?
  @Published var lastError: String?
  @Published var lastAmountCents: Int?

  private let collector = TapToPayCollector()

  func handleIncomingURL(_ url: URL) {
    do {
      let parsed = try DeepLinkParser.parse(url)
      handoff = parsed
      lastError = nil
      statusMessage = "Zahlung empfangen — tippe auf „Zahlung starten“."
    } catch {
      lastError = error.localizedDescription
      statusMessage = error.localizedDescription
    }
  }

  func collectPayment() async {
    guard let handoff else { return }
    isCollecting = true
    lastError = nil
    statusMessage = "Verbinde Tap to Pay…"
    defer { isCollecting = false }

    do {
      try await collector.collect(
        apiBase: handoff.apiBase,
        handoffToken: handoff.handoffToken,
        clientSecret: handoff.clientSecret,
        paymentIntentId: handoff.paymentIntentId
      )
      statusMessage = "Geschafft! Die Web-Tageskasse zeigt den Beleg automatisch."
    } catch {
      lastError = error.localizedDescription
      statusMessage = error.localizedDescription
    }
  }
}
