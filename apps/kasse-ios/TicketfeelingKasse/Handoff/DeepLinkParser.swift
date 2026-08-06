import Foundation

enum DeepLinkParser {
  enum ParseError: LocalizedError {
    case wrongScheme
    case missingParam(String)

    var errorDescription: String? {
      switch self {
      case .wrongScheme:
        return "Ungültiger Link (erwartet ticketfeeling-kasse://pay)."
      case .missingParam(let name):
        return "Deep Link unvollständig: \(name) fehlt."
      }
    }
  }

  static func parse(_ url: URL) throws -> TapHandoff {
    guard url.scheme == "ticketfeeling-kasse" else { throw ParseError.wrongScheme }
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      throw ParseError.wrongScheme
    }
    let items = Dictionary(
      uniqueKeysWithValues: (components.queryItems ?? []).compactMap { item -> (String, String)? in
        guard let value = item.value, !value.isEmpty else { return nil }
        return (item.name, value)
      }
    )

    func require(_ key: String) throws -> String {
      guard let value = items[key] else { throw ParseError.missingParam(key) }
      return value
    }

    let apiBaseRaw = try require("apiBase")
    guard let apiBase = URL(string: apiBaseRaw) else {
      throw ParseError.missingParam("apiBase")
    }

    return TapHandoff(
      orderId: try require("orderId"),
      paymentIntentId: try require("paymentIntentId"),
      clientSecret: try require("clientSecret"),
      handoffToken: items["handoff"],
      apiBase: apiBase
    )
  }
}
