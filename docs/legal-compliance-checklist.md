# Rechts-, Haftungs- und Abrechnungscheckliste

**Status:** Verbindliche Arbeitsgrundlage für den Start  
**Stand:** 2026-07-31  
**Hinweis:** Keine Rechtsberatung. Texte vor Produktivstart durch Anwalt/Steuerberater freigeben.

## Startstruktur

* **Rechtlicher Betreiber / Verkäufer / Veranstalter:** Peter Loder (Einzelunternehmen)
* **Geschäftsbezeichnung:** Ticketfeeling
* **Veranstaltungsmarke:** SCHLAGERfeeling
* **Öffentliche Anschrift:** Innere Münchener Str. 36, 84028 Landshut (Impressum/Kontakt/Rechtstexte)
* **Rechnungsanschrift (intern):** Konradinstr. 6, 84032 Altdorf — nur Rechnungen/Steuerbelege, nie öffentlich
* Ticketfeeling ist zunächst **keine** eigene Firma und verwahrt **keine** fremden Gelder.

### Externe Darstellung

Nicht nur „Ticketfeeling“. Verbindlich z. B.:

* **Peter Loder – Ticketfeeling**
* oder **Peter Loder, handelnd unter Ticketfeeling**

Im Shop muss klar sein: Vertragspartner des Kunden ist Peter Loder.

## Technisch in der App umzusetzen / umgesetzt

| Anforderung | Status |
|---|---|
| Stammdaten Peter Loder inkl. Anschrift Landshut | in Seed/Stammdaten |
| Verkäufer-/Veranstalter-Snapshot je Bestellung | umgesetzt |
| Rechtstextversionen an Bestellung | umgesetzt (AGB, Privacy, Event conditions) |
| Checkout-Button „Zahlungspflichtig bestellen“ | umgesetzt |
| Getrennte Checkboxen AGB/Veranstaltungsbedingungen + Datenschutz zur Kenntnis | umgesetzt |
| Widerrufshinweis termingebundene Veranstaltung | umgesetzt |
| Geschlecht/Geburtsdatum optional | umgesetzt |
| Steuersätze konfigurierbar (Default Ticket 7 %) | umgesetzt |
| Rechnungsnummernkreis `TF-R-JJJJ-…` | umgesetzt |
| Bestellnummernkreis `TF-B-JJJJ-…` | umgesetzt |
| Ticketnummernkreis `TF-T-JJJJ-…` | umgesetzt |
| Consent-Banner (notwendig vs. Statistik/Marketing) | Basis umgesetzt |
| Stripe Direct auf Händlerkonto Peter Loder | offen |
| AV-Verträge / VVT / GoBD-Verfahrensdoku | organisatorisch offen |
| Anwaltlich geprüfte Rechtstexte | organisatorisch offen |
| TSE/KassenSichV vor Tageskasse | bewusst blockiert bis Prüfung |

## Vor Produktivstart (extern)

Siehe Abschnitte 19 der ChatGPT-Checkliste: Gewerbe, Versicherungen, Steuerberater (7 % / VIP), Anwalt (AGB/Widerruf/Privacy), Marke Ticketfeeling, Lexware-Prozess, Backup-Tests.

## Später bei Fremdveranstaltern neu prüfen

UG/GmbH, Plattform-AGB, getrennte Händlerkonten, Provisionsabrechnung, Zahlungsaufsicht — **nicht** für den Erststart erforderlich.
