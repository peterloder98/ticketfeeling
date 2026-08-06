import Foundation
#if canImport(StripeTerminal)
import StripeTerminal
#endif

/// Fetches a Stripe Terminal ConnectionToken from Ticketfeeling API.
final class TerminalConnectionTokenProvider: NSObject {
  private let apiBase: URL
  private let handoffToken: String?

  init(apiBase: URL, handoffToken: String?) {
    self.apiBase = apiBase
    self.handoffToken = handoffToken
  }

  func fetchConnectionToken() async throws -> String {
    var request = URLRequest(url: apiBase.appendingPathComponent("api/v1/box-office/terminal/connection-token"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let handoffToken {
      request.setValue("Bearer \(handoffToken)", forHTTPHeaderField: "Authorization")
      let body = try JSONSerialization.data(withJSONObject: ["handoff": handoffToken])
      request.httpBody = body
    } else {
      request.httpBody = Data("{}".utf8)
    }

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
      throw TapCollectError.connectionTokenFailed
    }
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    guard let secret = json?["secret"] as? String, !secret.isEmpty else {
      throw TapCollectError.connectionTokenFailed
    }
    return secret
  }
}

#if canImport(StripeTerminal)
extension TerminalConnectionTokenProvider: ConnectionTokenProvider {
  func fetchConnectionToken(_ completion: @escaping ConnectionTokenCompletionBlock) {
    Task {
      do {
        let secret = try await fetchConnectionToken()
        completion(secret, nil)
      } catch {
        completion(nil, error)
      }
    }
  }
}
#endif
