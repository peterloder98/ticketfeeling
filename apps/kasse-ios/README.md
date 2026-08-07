# Ticketfeeling Kasse (iOS) — Tap to Pay on iPhone

Companion app for **Tageskasse** Stripe Terminal / Tap to Pay. The web UI at `/kasse` creates the order + PaymentIntent; this app collects the card present payment. Tickets are fulfilled via the existing Stripe webhook (web polls until ready).

> **Pilot:** iPhone only. No hardware readers. Cash stays on web (no Stripe).

## Architecture

```
Web Tageskasse                    iOS Kasse app                 Stripe
     |                                  |                         |
     |-- POST /box-office/sales/tap --->|                         |
     |   (order held + PI card_present) |                         |
     |<-- deepLink + handoff (no secret)|                         |
     |-- open ticketfeeling-kasse:// -->|                         |
     |                                  |-- payment-intent ------->| (fetch clientSecret)
     |                                  |-- ConnectionToken ----->|
     |                                  |-- collect + confirm --->|
     |                                  |                         |
     |<-- webhook payment_intent.succeeded → fulfillPaidOrder ----|
     |-- poll GET /box-office/sales/:id until ready               |
     |-- /kasse/beleg/:id                                         |
```

Deep link scheme: `ticketfeeling-kasse://pay?...`

Query params:

| Param | Meaning |
|---|---|
| `orderId` | Ticketfeeling order UUID |
| `paymentIntentId` | Stripe `pi_…` |
| `handoff` | Short-lived token (required) — fetch `clientSecret` + ConnectionToken |
| `apiBase` | API origin (e.g. `https://ticketfeeling-web.vercel.app`) |

`clientSecret` is **not** placed in the URL (avoid logs / history / Referer). The app loads it via `POST …/terminal/payment-intent`.

## Prerequisites (Peter)

### 1. Apple

1. Apple Developer Program membership
2. App ID with **Tap to Pay on iPhone** entitlement (request via Apple if not already approved — you mentioned Tap to Pay is already set up on the phone)
3. Provisioning profile that includes that entitlement
4. Device: iPhone XS or later, iOS 16.4+, region supported by Stripe Tap to Pay

### 2. Stripe

1. Stripe account with **Terminal** + **Tap to Pay on iPhone** enabled (Dashboard)
2. Create a **Location** (Terminal → Locations) → copy Location ID
3. Set Vercel env `STRIPE_TERMINAL_LOCATION_ID` (and existing `STRIPE_SECRET_KEY` / webhook secret)
4. Ensure webhook listens for `payment_intent.succeeded` (already used for online card)

### 3. Xcode project setup

1. Open Xcode 15+ → **File → New → Project → App** (SwiftUI, iOS)
2. Product name: `TicketfeelingKasse`, bundle id e.g. `de.ticketfeeling.kasse`
3. Replace generated sources with files under `TicketfeelingKasse/` in this folder (or add them to the target)
4. **File → Add Package Dependencies** → Stripe Terminal iOS SDK:
   - URL: `https://github.com/stripe/stripe-terminal-ios`
   - Product: `StripeTerminal`
5. In Signing & Capabilities:
   - Add **Tap to Pay on iPhone** (or the entitlement key Apple provides)
   - Near Field Communication Tag Reading if prompted
6. Info.plist:
   - URL Types → URL Schemes: `ticketfeeling-kasse`
   - Privacy strings as required by Stripe Terminal / NFC
7. Build & run on a **physical iPhone** (Simulator cannot Tap to Pay)

### 4. Entitlement snippet

Add to the app’s entitlements file (exact key may match your Apple approval letter):

```xml
<key>com.apple.developer.proximity-reader.payment.acceptance</key>
<true/>
```

### 5. First live tap checklist

- [ ] `STRIPE_TERMINAL_LOCATION_ID` set on Vercel → redeploy
- [ ] Stripe Dashboard location matches the reader/Tap to Pay setup you already completed
- [ ] iOS app installed on the same account’s iPhone with Tap to Pay configured
- [ ] Staff logged into web `/kasse` → Verkauf → **Karte (Tap to Pay)** → deep link opens app
- [ ] Card tap succeeds → web jumps to Beleg; tickets appear as with Bar
- [ ] Stripe PaymentIntent metadata contains `orderId`, `organizationId`, `soldByUserId`, `source=box_office_tap`

## API used by the app

- `POST {apiBase}/api/v1/box-office/terminal/payment-intent`  
  Body: `{ "handoff": "<token>" }` → `{ "orderId", "paymentIntentId", "clientSecret", "locationId" }`
- `POST {apiBase}/api/v1/box-office/terminal/connection-token`  
  Body: `{ "handoff": "<token>" }` → `{ "secret", "locationId" }`
- Payment collection uses Stripe Terminal SDK with the `clientSecret` from payment-intent
- Fulfillment is **server-side** (webhook). App only needs to show success; web polls.

## Limitation (web alone)

Browsers cannot run Stripe Terminal Tap to Pay. The waiting UI + deep link is intentional (Option B).

## Scaffold layout

```
apps/kasse-ios/
  README.md                 ← this file
  TicketfeelingKasse/
    TicketfeelingKasseApp.swift
    ContentView.swift
    Info.plist
    Handoff/DeepLinkParser.swift
    Terminal/TerminalConnectionTokenProvider.swift
    Terminal/TapToPayCollector.swift
```

Copy these into your Xcode target and finish signing/entitlements as above.
