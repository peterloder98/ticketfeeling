# Ticketfeeling

Web-App für Ticketing & Eventmanagement (SCHLAGERfeeling zuerst, mandantenfähig vorbereitet).

**Das ist eine Web-App** im Browser — keine App-Store-App. Scanner läuft als Browser-/PWA-Oberfläche.

## Status

| Bereich | Stand |
|---|---|
| Fundament (Auth, RBAC, Audit, Org) | ✅ |
| Stammdaten / Eventseiten / Hilfe-Chat | ✅ |
| Rechtlicher Verkäufer Peter Loder + Checkout-Recht | ✅ Entwürfe |
| Ticketverkauf (Warenkorb, Checkout, Rechnung, QR) | ✅ lokal mit **Dev-Zahlung** |
| Scanner Check-in/out | ✅ Basis |
| Admin-Verkaufsstatistik | ✅ |
| Tageskasse (intern, **kein TSE**) | ✅ Basis |
| Ticket vergessen (Magic-Link) | ✅ Link per Mail-Stub / Dev-Console |
| PaymentProvider (Dev + Stripe-Stub) | ✅ |
| Lexware AccountingProvider | ⏳ Stub |
| Stripe Direct live / PayPal | ⏳ |
| Echtes PDF + E-Mail-Provider | ⏳ HTML-Ticket da |
| Saalplan, Rabatte, Tracking-Pixel | ⏳ |

## Schnellstart

```bash
# Postgres
brew services start postgresql@16
createdb ticketfeeling   # falls noch nicht vorhanden

cd apps/web
cp ../../.env.example .env   # falls nötig
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Öffnen: [http://localhost:3000](http://localhost:3000)

### Admin-Login

* E-Mail: `admin@ticketfeeling.local`
* Passwort: `TicketfeelingAdmin!2026`

### Ticket kaufen (Demo)

1. Event öffnen: `/event/schlagerfeeling-weihnachtstraum-2026`
2. Kategorie in den Warenkorb
3. Checkout → **Zahlungspflichtig bestellen**
4. Auf der Zahlungsseite **Testzahlung jetzt bezahlen** (Dev-Webhook)
5. Tickets + Rechnung unter Bestellung / Konto
6. Token im **Scanner** (`/scanner`) einfügen → Grün, zweiter Scan → Rot

> Die Dev-Zahlung ist **kein** Stripe. Vor Produktivbetrieb Stripe Direct anbinden.

### Smoke-Test

```bash
cd apps/web
BASE_URL=http://localhost:3000 node scripts/e2e-smoke.mjs
```

## Dokumentation

Konzept & Architektur unter [`docs/`](docs/).
