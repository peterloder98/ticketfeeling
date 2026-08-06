import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var session: TapSessionStore

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 20) {
        Text("Ticketfeeling Kasse")
          .font(.largeTitle.bold())
          .foregroundStyle(Color(red: 15 / 255, green: 39 / 255, blue: 71 / 255))

        Text("Tap to Pay auf iPhone")
          .font(.title3)
          .foregroundStyle(Color(red: 20 / 255, green: 184 / 255, blue: 166 / 255))

        if let handoff = session.handoff {
          VStack(alignment: .leading, spacing: 8) {
            Text("Offene Zahlung")
              .font(.headline)
            Text("Auftrag: \(handoff.orderId)")
              .font(.footnote.monospaced())
              .foregroundStyle(.secondary)
            Text(amountLabel(cents: session.lastAmountCents))
              .font(.title2.bold())

            Button {
              Task { await session.collectPayment() }
            } label: {
              Text(session.isCollecting ? "Warte auf Karte…" : "Zahlung starten")
                .frame(maxWidth: .infinity)
                .padding()
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 20 / 255, green: 184 / 255, blue: 166 / 255))
            .disabled(session.isCollecting)
          }
          .padding()
          .background(Color(.secondarySystemBackground))
          .clipShape(RoundedRectangle(cornerRadius: 16))
        } else {
          Text("Starte einen Verkauf in der Web-Tageskasse und tippe „Tap to Pay auf iPhone öffnen“. Diese App empfängt den Deep Link und zieht die Karte ein.")
            .foregroundStyle(.secondary)
        }

        if let message = session.statusMessage {
          Text(message)
            .font(.callout)
            .foregroundStyle(session.lastError == nil ? .primary : .red)
        }

        Spacer()
      }
      .padding(24)
      .navigationBarTitleDisplayMode(.inline)
    }
  }

  private func amountLabel(cents: Int?) -> String {
    guard let cents else { return "Betrag folgt vom Terminal" }
    let value = Double(cents) / 100.0
    return String(format: "%.2f €", value)
  }
}
