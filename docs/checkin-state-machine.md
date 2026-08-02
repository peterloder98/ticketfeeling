# Check-in State Machine

**Status:** Entwurf

## Presence States (pro Ticket)

```text
not_arrived → IN → OUT → IN → OUT → ...
```

## Scan-Ergebnisse (UI)

| Farbe | Fälle |
|---|---|
| Grün | gültig, erstmalig oder erneut zulässig |
| Rot | already in, cancelled, refunded, invalid QR, blocked |
| Orange | wrong event/date, outside door time, needs manual review |
| Blau/Special | VIP, Sponsor, Presse, Rollstuhl, besondere Berechtigung |

## Statistikregeln

* `first_checked_in_count`: Person/Ticket nur einmal beim ersten erfolgreichen IN
* `currently_in`: Presence == IN
* `currently_out`: Presence == OUT (nach mindestens einem IN)
* `not_arrived`: nie IN gewesen und Ticket gültig
* Re-IN nach OUT erhöht nicht `first_checked_in_count`

## Check-in Event Log (immutable)

Jeder Scan:

* ticket_id, event_id, action (`in`|`out`|`lookup`), result
* timestamp, user_id, device_id, entrance_id
* previous_presence, new_presence, reason (manual)

## Offline (vorbereitet)

Standard: Online-Validierung.

Konfliktstrategie (Dokumentationspflicht vor Implementierung):

**Annahme (Vorschlag):** Server gewinnt bei Konflikten; Offline-Scans mit früherem Timestamp werden als `needs_review` markiert, wenn Online-State widerspricht. Keine stillen Doppel-INs.

## Manuelle Override

Nur `checkin:manual_override`. Immer mit Grund + Audit.
