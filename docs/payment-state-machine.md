# Payment State Machine

**Status:** Entwurf

## Prinzip

Ticketfeeling ist Order-Orchestrator, nicht Treuhänder. Zahlungen laufen auf dem Händleraccount des Veranstalters. Kartendaten werden nicht gespeichert.

## States

| State | Bedeutung |
|---|---|
| `created` | Interne Payment-Zeile angelegt |
| `pending` | Auf Provider-Bestätigung wartend |
| `requires_action` | 3DS / Kundenaktion nötig |
| `processing` | Provider verarbeitet |
| `paid` | Vollständig bezahlt |
| `partially_paid` | Teilzahlung (z. B. Giftcard + Rest) |
| `failed` | Fehlgeschlagen |
| `expired` | Zahlungsfenster abgelaufen |
| `cancelled` | Abgebrochen |
| `partially_refunded` | Teilrefund |
| `refunded` | Vollrefund |
| `disputed` | Dispute eröffnet |
| `chargeback` | Chargeback verloren/gebucht |

## Übergänge

```text
created → pending → requires_action → processing → paid
                 └→ failed / expired / cancelled
paid → partially_refunded → refunded
paid / partially_refunded → disputed → chargeback | paid (won)
```

## Webhook-Verarbeitung

1. Roh-Body entgegennehmen.
2. Signatur prüfen (fail closed).
3. In `webhook_inbox` speichern (unique provider event id).
4. Async verarbeiten; Attempts protokollieren.
5. Idempotent: bereits verarbeitetes Event → no-op success.
6. Domain-Transition nur wenn Statusfortschritt gültig.
7. Order-Finalisierung genau einmal (`fulfillment_lock` / outbox).

## Verbote

* Kaufbestätigung nur über Thank-You-Page
* Doppelte Ticketausstellung bei doppeltem Webhook
* Betrag/Währung aus Client übernehmen ohne Provider-Match

## Felder

* internal payment id, order id, provider, provider payment/intent id
* amount_cents, currency, method, fees_cents
* paid_at, payout_status, raw_status, normalized_status
