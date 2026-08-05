# ADR-005: Rechtlicher Verkäufer Peter Loder (Einzelunternehmen)

**Status:** Accepted  
**Datum:** 2026-07-31

## Kontext

Zum Start ist Ticketfeeling keine eigene Gesellschaft. Betreiber, Verkäufer und Veranstalter ist Peter Loder.

## Entscheidung

* Anzeige nach außen: **Peter Loder – Ticketfeeling**
* **Öffentliche Anschrift** (Impressum, Kontakt, AGB, …): Innere Münchener Str. 36, 84028 Landshut — gespeichert als `OrganizationSettings.publicCompanyAddress`
* **Rechnungs-/Steueranschrift** (nur Invoice-PDFs, Auszahlungsbelege): Konradinstr. 6, 84032 Altdorf — `billingCompanyAddress`; nie öffentlich anzeigen
* SCHLAGERfeeling bleibt Veranstaltungsmarke
* Jede Bestellung speichert unveränderliche `sellerSnapshot` (öffentliche Anschrift), `organizerSnapshot`, `contractSnapshot`; Rechnungen speichern Billing-`sellerSnapshot`
* Kundengelder fließen auf den Händleraccount von Peter Loder (kein Plattform-Treuhandmodell)
* Tageskasse erst nach TSE/KassenSichV-Prüfung

## Konsequenzen

* Impressum/Rechnungen dürfen nicht nur „Ticketfeeling“ nennen
* Bei Öffnung für Fremdveranstalter neue Rechts-/Zahlungsstruktur nötig
