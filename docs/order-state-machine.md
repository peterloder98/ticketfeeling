# Order State Machine

**Status:** Entwurf

## States

| State | Bedeutung |
|---|---|
| `draft` | Warenkorb/Checkout noch nicht verbindlich |
| `pending_payment` | Bestellung angelegt, Zahlung erwartet |
| `processing_payment` | Provider verarbeitet / requires action läuft |
| `paid` | Zahlung vollständig bestätigt |
| `payment_failed` | Zahlung fehlgeschlagen |
| `partially_fulfilled` | Teil der Tickets/Dokumente erzeugt |
| `fulfilled` | Tickets + Rechnung erzeugt, Kundenbenachrichtigung angestoßen |
| `partially_cancelled` | Teil storniert |
| `cancelled` | vollständig storniert (vor/ohne Erfüllung oder nach Void) |
| `partially_refunded` | Teilbetrag erstattet |
| `refunded` | vollständig erstattet |
| `disputed` | Chargeback/Dispute offen |
| `archived` | abgeschlossen archiviert |

## Erlaubte Übergänge

```text
draft → pending_payment → processing_payment → paid → partially_fulfilled → fulfilled
                │                │
                ├→ payment_failed
                └→ cancelled

paid / fulfilled → partially_cancelled → cancelled
paid / fulfilled → partially_refunded → refunded
any active paid* → disputed
fulfilled → archived
```

## Regeln

1. Übergang nach `paid` **nur** nach erfolgreicher Payment-State-Machine (`paid`/`partially_paid` mit Betragsmatch).
2. Frontend-Redirect allein löst nie `paid` aus.
3. Ticket-/Invoice-Erzeugung idempotent aus `paid`.
4. Historische Order Items sind immutable Snapshots.
5. Jeder Übergang: `order_status_events` + Audit.

## Side Effects

| Transition | Effects |
|---|---|
| → `pending_payment` | Holds an Order binden, Legal acceptances speichern |
| → `paid` | Queue: invoices, tickets, email, tracking, accounting |
| → `payment_failed` | Holds freigeben oder Retry-Fenster (Policy) |
| → `cancelled` (unpaid) | Holds freigeben |
| → `refunded` / partial | Tickets void, correction docs, mail, accounting |
