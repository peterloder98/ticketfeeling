# Ticket State Machine

**Status:** Entwurf

## States

| State | Bedeutung |
|---|---|
| `created` | Datensatz erzeugt, noch nicht nutzbar |
| `active` | Gültig für Einlass (im Einlassfenster) |
| `transferred` | Besitz übertragen (historischer Marker oder aktueller Status am alten Ticket = `replaced`) |
| `checked_in` | Aktuell eingecheckt (Presence IN) — siehe auch Check-in SM |
| `checked_out` | Ausgecheckt, Wiedereintritt möglich |
| `blocked` | Manuell gesperrt |
| `cancelled` | Storniert |
| `refunded` | Erstattet / entwertet |
| `replaced` | Durch neues Ticket ersetzt (Umbuchung/Transfer) |
| `expired` | Event vorbei / ungültig geworden |

**Annahme:** Presence (`IN`/`OUT`) wird primär über Check-in-State geführt; Ticketstatus bleibt `active` mit Presence-Flag **oder** nutzt `checked_in`/`checked_out` als Presence-Spiegel. Empfehlung: `tickets.status` für Lebenszyklus, `tickets.presence` ∈ {`not_arrived`,`in`,`out`} für Einlass. Siehe ADR-003.

## Übergänge

```text
created → active
active → transferred/replaced (new ticket active)
active → blocked → active
active → cancelled | refunded | expired | replaced
active + presence changes via checkin (does not cancel ticket)
```

## QR-Regeln

* Ein aktiver Token pro Ticket.
* Transfer/Replace: alten Token deaktivieren, neuen erzeugen, auditieren.
* Token = kryptografisch sicher; speichere Hash; QR enthält nicht PII.
* Validation: org, event, status, presence rules, time window.

## Ticket vergessen / Resend

* Ändert Ticketstatus nicht.
* Erzeugt `ticket_resend_events` + optional neue signed download URLs.
* Bei `replaced`/`cancelled`/`refunded`: kein aktives Ticket zustellen.

## Ausgabe

1 Order mit n Tickets → n Ticketnummern → n QR → n PDFs (+ optional Sammel-PDF).
