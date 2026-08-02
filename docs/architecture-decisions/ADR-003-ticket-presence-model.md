# ADR-003: Ticket-Lebenszyklus vs. Presence

**Status:** Accepted (Annahme)  
**Datum:** 2026-07-31

## Kontext

Check-in/out wechseln mehrfach; Ticketstatus (active/refunded/…) ist orthogonal.

## Entscheidung

* `tickets.status` = Lebenszyklus (`created`, `active`, `blocked`, `cancelled`, `refunded`, `replaced`, `expired`, …)
* `tickets.presence` = `not_arrived` | `in` | `out`
* Jede Änderung über append-only `checkin_events`

## Konsequenzen

* Klarere Statistiken (first IN vs currently IN)
* Scanner-Logik unabhängig von Refund/Transfer-Statusprüfungen
* UI-Farben leiten sich aus Kombination status+presence+event window ab
