# E-Mail-Konzept

**Status:** Entwurf

## 1. Provider-Annahme

Transaktionaler Anbieter mit Delivery Events, Bounces, Retries (z. B. Resend oder Postmark). Versand über Queue.

## 2. Vorlagen (mind.)

* Kontoaktivierung, Magic Link, E-Mail-Verifizierung, Passwort-Reset
* Bestellbestätigung, Zahlung erfolgreich/fehlgeschlagen
* Tickets, Rechnung, Rechnungskorrektur
* Ticketübertragung, Ticket erneut senden (forgotten ticket)
* Eventerinnerung, Eventänderung, Eventabsage
* Rückerstattung, Warteliste
* Support-Handoff-Bestätigung
* Tages-/Wochen-/Monatsbericht

## 3. Anforderungen

* Org-Branding, Mehrsprachigkeit (Start DE)
* Variablen, Versionierung, Preview, Testsend
* Secure download links für PDFs
* Per-order mail log
* Bounce handling; no infinite retries on hard bounce

## 4. Automatische Berichte

| Bericht | Default |
|---|---|
| Täglich | Folgetag morgens, Org-Timezone |
| Wöchentlich | konfigurierbar |
| Monatlich | konfigurierbar |

Inhalte gemäß Master-Prompt §29. Ausgabe: HTML + PDF; optional CSV/XLSX. Archiv + Resend im Backend.

## 5. Ticket vergessen

Separate Template-Familie:

* `forgotten_ticket_magic_link`
* `tickets_resent`
* Generische Non-enumeration UX im Client; Mail nur bei Match
