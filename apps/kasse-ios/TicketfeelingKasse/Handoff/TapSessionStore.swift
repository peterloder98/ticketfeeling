import Foundation
import Combine

struct TapHandoff {
  let orderId: String
  let paymentIntentId: String
  /// Present only for legacy deep links; prefer fetching via handoff.
  var clientSecret: String?
  let handoffToken: String
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
    guard var handoff else { return }
    isCollecting = true
    lastError = nil
    statusMessage = "Verbinde Tap to Pay…"
    defer { isCollecting = false }

    do {
      let clientSecret: String
      if let existing = handoff.clientSecret, !existing.isEmpty {
        clientSecret = existing
      } else {
        statusMessage = "Hole Zahlungsdaten…"
        clientSecret = try await fetchClientSecret(for: handoff)
        handoff.clientSecret = clientSecret
        self.handoff = handoff
      }

      try await collector.collect(
        apiBase: handoff.apiBase,
        handoffToken: handoff.handoffToken,
        clientSecret: clientSecret,
        paymentIntentId: handoff.paymentIntentId
      )
      statusMessage = "Geschafft! Die Web-Tageskasse zeigt den Beleg automatisch."
    } catch {
      lastError = error.localizedDescription
      statusMessage = error.localizedDescription
    }
  }

  private func fetchClientSecret(for handoff: TapHandoff) async throws -> String {
    let url = handoff.apiBase.appendingPathComponent("api/v1/box-office/terminal/payment-intent")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(handoff.handoffToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["handoff": handoff.handoffToken])

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw URLError(.badServerResponse)
    }
    guard
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let secret = json["clientSecret"] as? String,
      !secret.isEmpty
    else {
      throw URLError(.cannotParseResponse)
    }
    return secret
  }
}
