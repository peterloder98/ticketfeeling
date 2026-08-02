# ADR-002: Direkter Geldfluss zum Veranstalter

**Status:** Accepted  
**Datum:** 2026-07-31

## Kontext

Kundengelder dürfen nicht auf einem Ticketfeeling-Sammelkonto liegen. SCHLAGERfeeling hat eigene Händlerverträge.

## Entscheidung

Zahlungen laufen über den Payment-Account der Organisation (zuerst Stripe Direct / eigener Account). Ticketfeeling orchestriert Checkout, Webhooks und Fulfillment, ist aber nicht Zwischenempfänger.

## Konsequenzen

* Pro Organisation Payment-Connection + Status
* Webhook- und Connect-/Account-Konfiguration je Mandant
* Plattformgebühren-Modell später separat; nicht mit Treuhand vermischen
* Refunds über denselben Provider-Account
