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

## Env

```bash
CRON_SECRET="long-random-secret"
# Optional: Vercel Cron Authorization Bearer = CRON_SECRET
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

Webhook-Endpoint bleibt: `/api/v1/payments/webhooks/stripe`  
Zusätzlich in Stripe Dashboard abonnieren: `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`, `balance.available`, `charge.updated`, `refund.*`

Cron: `GET /api/v1/cron/stripe-payout-reconcile?kind=daily` mit Header `Authorization: Bearer $CRON_SECRET`

## Manuelle Auszahlungen

Status `unsupported_manual_payout` — keine Behauptung vollständiger Auto-Zuordnung.

## Lexoffice

Keine Auto-Buchung. Nach Finalisierung der drei internen Belege: Bankeingang in Lexoffice öffnen, Dokumente anhängen, in Ticketfeeling „Als in Lexoffice zugeordnet markieren“.

## Live-Pilot (Phase 10)

1. Stripe Dashboard: automatische wöchentliche Auszahlungen (Mo) prüfen
2. Sandbox: Testzahlungen + simulierte Payouts, Bericht vs. Dashboard centgenau
3. Kleine Live-Verkäufe, erste echte Auszahlung abwarten
4. Steuerberater prüft Belege
5. Erst danach regulärer Workflow

Bestehende Bestellungen/Rechnungen werden nicht rückwirkend verändert.
