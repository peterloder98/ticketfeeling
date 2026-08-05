# Stripe-Auszahlungsabgleich (Payout Reconciliation)

## Überblick

Ticketfeeling importiert Stripe-Auszahlungen **ausschließlich über die Stripe-Payout-ID** und die zugehörigen Balance Transactions. Es gibt keine Zuordnung über Verkaufsdatum oder geschätzte Wochensummen.

Pfad Admin: **Finanzen → Stripe-Auszahlungen** (`/admin/finanzen/stripe`)

## Architektur

1. **Webhooks** (`payout.*`, `balance.available`, `charge.updated`, `refund.*`) → Event in `stripe_webhook_events` → Import
2. **Cron** (Vercel): täglich ~06:00 Europe/Berlin (`0 4 * * *` UTC), monatlich 120 Tage
3. **Importer** lädt alle BT-Seiten (`has_more` / `starting_after`)
4. **Klassifikation** + **Order-Mapping** (PI / Charge / BT / Metadata)
5. **Reconciliation** nur bei **0 Cent** Differenz
6. **Dokumente** erst nach Admin-Klick „verbindlich erzeugen“ (PDF + SHA-256, unveränderlich)

---

## Einrichtung Schritt für Schritt (Produktion)

Diese Schritte einmalig nach dem Deploy ausführen. Ohne Webhooks + `CRON_SECRET` läuft der Abgleich nicht zuverlässig.

### 1. Neue Stripe-Webhook-Events abonnieren

**Ziel:** Stripe soll Auszahlungs- und Balance-Events an Ticketfeeling senden.

1. Öffne das **Stripe Dashboard** (Live-Modus, nicht Test):  
   [https://dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Klicke auf den bestehenden Endpoint für Ticketfeeling  
   (URL endet typischerweise auf `/api/v1/payments/webhooks/stripe`).  
   Falls noch keiner existiert: **Add endpoint** → URL  
   `https://<deine-domain>/api/v1/payments/webhooks/stripe`  
   (z. B. `https://www.ticketfeeling.de/api/v1/payments/webhooks/stripe`).
3. Klicke **…** → **Update details** bzw. **Select events** / **Add events**.
4. Stelle sicher, dass **genau diese Events** aktiv sind (Haken setzen):

| Event | Zweck |
| --- | --- |
| `payout.created` | Neue Auszahlung angekündigt |
| `payout.updated` | Status/Betrag geändert |
| `payout.paid` | Auszahlung auf dem Bankkonto angekommen |
| `payout.failed` | Auszahlung fehlgeschlagen |
| `payout.canceled` | Auszahlung storniert |
| `balance.available` | Guthaben verfügbar (Nachzieh-Import) |
| `charge.updated` | Charge-Metadaten für Order-Mapping |
| `refund.created` | Erstattung angelegt |
| `refund.updated` | Erstattung geändert |
| `refund.failed` | Erstattung fehlgeschlagen |

5. Speichern. Das **Signing Secret** (`whsec_…`) muss in Vercel als `STRIPE_WEBHOOK_SECRET` stehen (unverändert lassen, wenn der Endpoint schon existierte).
6. Optional prüfen: Stripe → Endpoint → **Send test webhook** mit z. B. `payout.paid` — in Admin unter Finanzen → Stripe sollte ein Event ankommen bzw. im Log erscheinen.

**Hinweis Testmodus:** Für Sandbox dieselben Events am **Test**-Webhook-Endpoint abonnieren (Stripe Toggle „Test mode“).

### 2. `CRON_SECRET` in Vercel setzen

**Ziel:** Nur autorisierte Aufrufe dürfen den täglichen/monatlichen Abgleich-Cron starten.

1. Öffne das Vercel-Projekt: [https://vercel.com/dashboard](https://vercel.com/dashboard) → Ticketfeeling-Projekt.
2. **Settings** → **Environment Variables**.
3. Variable anlegen oder prüfen:

| Name | Wert | Environments |
| --- | --- | --- |
| `CRON_SECRET` | langer Zufallsstring (mind. 32 Zeichen, z. B. aus `openssl rand -hex 32`) | Production (und Preview, falls gewünscht) |

4. Speichern. **Redeploy** auslösen (Deployments → … → Redeploy), damit die Variable im laufenden Deployment greift.
5. Cron-Routen in `apps/web/vercel.json` (bereits hinterlegt):
   - Täglich: `GET /api/v1/cron/stripe-payout-reconcile?kind=daily` — Schedule `0 4 * * *` (UTC = 06:00 Berlin Sommerzeit / 05:00 Winterzeit)
   - Monatlich: `GET /api/v1/cron/stripe-payout-reconcile?kind=monthly` — Schedule `30 3 1 * *`
6. Vercel sendet an Cron-Routen den Header `Authorization: Bearer <CRON_SECRET>` — der Code akzeptiert genau diesen Bearer-Token (oder Query `?secret=` als Fallback).
7. Manuell testen (nach Deploy):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.ticketfeeling.de/api/v1/cron/stripe-payout-reconcile?kind=daily"
```

Erwartet: JSON mit `"ok": true`. Bei `"UNAUTHORIZED"` ist das Secret falsch oder nicht deployed.

Weitere Env (bereits vorhanden prüfen):

```bash
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
CRON_SECRET=…
```

### 3. Automatische wöchentliche Auszahlungen prüfen

**Ziel:** Stripe zahlt regelmäßig aus (Ticketfeeling erwartet **automatische** Payouts; manuelle sind `unsupported_manual_payout`).

1. Stripe Dashboard (Live): [https://dashboard.stripe.com/settings/payouts](https://dashboard.stripe.com/settings/payouts)  
   oder **Settings → Payouts** / **Bank accounts and scheduling**.
2. Prüfen:
   - **Payout schedule** = **Automatic**
   - Intervall = **Weekly** (empfohlen: Montag)
   - Bankkonto hinterlegt und verifiziert
3. Speichern falls geändert.
4. In Ticketfeeling Admin: **Finanzen → Stripe-Auszahlungen** — nach dem nächsten `payout.paid` sollte die Auszahlung importiert und (bei 0-Cent-Differenz) reconciliert werden.

### 4. Sandbox- / Live-Pilot (wie Phase 10)

Führe den Pilot **in dieser Reihenfolge** durch — nicht überspringen.

1. **Stripe Dashboard:** automatische wöchentliche Auszahlungen (Mo) wie in Schritt 3 bestätigt.
2. **Sandbox (Testmodus):**
   - Testzahlungen erzeugen (Karten `4242…`, ggf. SEPA-Test).
   - Payouts im Testmodus auslösen bzw. abwarten (Stripe Test: Balances / Payouts).
   - In Admin **Finanzen → Stripe** Bericht öffnen und **centgenau** mit Stripe Dashboard vergleichen (Betrag, BT-Anzahl, Differenz = 0).
3. **Kleine Live-Verkäufe:** wenige echte Tickets verkaufen, erste echte Auszahlung abwarten.
4. Erste Live-Auszahlung in Admin prüfen → bei Status `reconciled` und Differenz 0 Cent → Dokumente „verbindlich erzeugen“.
5. **Steuerberater** prüft die drei internen Belege (Erlös-Sammel, Stripe-Kosten, Auszahlungsabgleich).
6. Erst danach regulärer Wochen-Workflow.

Bestehende Bestellungen/Rechnungen werden durch den Payout-Abgleich **nicht** rückwirkend verändert.

---

## Env (Kurzreferenz)

```bash
CRON_SECRET="long-random-secret"
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

Webhook-Endpoint: `/api/v1/payments/webhooks/stripe`  
Cron: `GET /api/v1/cron/stripe-payout-reconcile?kind=daily|monthly` mit `Authorization: Bearer $CRON_SECRET`

## Manuelle Auszahlungen

Status `unsupported_manual_payout` — keine Behauptung vollständiger Auto-Zuordnung.

## Lexoffice

Keine Auto-Buchung. Nach Finalisierung der drei internen Belege: Bankeingang in Lexoffice öffnen, Dokumente anhängen, in Ticketfeeling „Als in Lexoffice zugeordnet markieren“.

## Firmenanschrift auf Auszahlungsbelegen

Interne Stripe-Auszahlungs-PDFs nutzen die **Rechnungsanschrift** (`billingCompanyAddress`, Konradinstr. / Altdorf) — nicht die öffentliche Landshut-Adresse. Kundenseitige Seiten zeigen nur die öffentliche Anschrift.
