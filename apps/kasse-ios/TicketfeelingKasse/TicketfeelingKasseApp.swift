import SwiftUI

@main
struct TicketfeelingKasseApp: App {
  @StateObject private var session = TapSessionStore()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(session)
        .onOpenURL { url in
          session.handleIncomingURL(url)
        }
    }
  }
}
