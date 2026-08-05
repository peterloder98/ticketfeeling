# Wallet-Pässe (Apple / Google)

Ticketfeeling kann Einlasstickets als **Apple Wallet** (`.pkpass`) und **Google Wallet** (Event Ticket) ausgeben. Dieselbe QR-Payload wie auf dem PDF wird verwendet — kein zweiter Identitätsraum.

## Was im Code steckt

| Bereich | Status |
|--------|--------|
| `.pkpass` erzeugen + Download-API | implementiert |
| Google Save-URL (JWT) + EventTicket Class/Object | implementiert |
| UI-Buttons Bestätigung / Ticket / Embed | implementiert (nur wenn konfiguriert) |
| E-Mail-Links „Zu Apple/Google Wallet“ | implementiert (nur wenn konfiguriert) |
| PassKit Web Service (Register / Update / Log) | implementiert |
| Void bei Storno / Refund / Dispute | implementiert |
| Signierte Production-Passes ohne eure Certs | **nicht möglich** |

## Credentials

Siehe Kommentare in `.env.example` (`APPLE_PASS_*`, `GOOGLE_WALLET_*`).

Ohne gesetzte Variablen bleiben Käufer-Buttons unsichtbar; APIs antworten mit `503 …_NOT_CONFIGURED`.

## Void-Strategie

1. Ticketstatus `voided` / `cancelled` + QR `revoked` (wie bisher bzw. jetzt auch bei Stripe-Refund).
2. `TicketWalletPass` → `status=voided`, `updateTag` erhöht.
3. **Apple:** nächster Pull über Web Service liefert Pass mit `voided: true`. Optional APNs-Push, wenn `APPLE_PASS_APNS_*` gesetzt.
4. **Google:** Object-State `INACTIVE` per Wallet Objects API.

## Lokal testen

1. Migration: `cd apps/web && npx prisma migrate deploy`
2. Ohne Certs: UI ohne Wallet-Buttons, APIs → 503.
3. Mit Apple-Certs (PEM in `.env`): Kauf → Bestellung → „Zu Apple Wallet“ → `.pkpass` laden (echtes iPhone / Simulator).
4. Mit Google Issuer + SA: Button öffnet `pay.google.com/gp/v/save/…`.
5. Storno (Tageskasse) oder Full-Refund: Pass sollte ungültig werden (Apple nach Refresh/Push, Google INACTIVE).

## Limits

- Signierte Apple-Passes brauchen eure Pass Type ID + Zertifikate; der Code allein liefert keine gültige Signatur.
- E-Mail-Wallet-Links erfordern Session oder Bestell-Zugang (`?t=`); reine Gäste ohne Login brauchen den Konto-Link oder Access-Token.
- Google Class `reviewStatus` startet als `UNDER_REVIEW` — in der Wallet Console freigeben für Produktion.
- APNs-Push für Sofort-Void ist optional; ohne Key funktioniert Void erst beim nächsten Pass-Update-Pull.
