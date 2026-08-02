# ADR-004: Support-Chatbot mit Grounding & harten Grenzen

**Status:** Accepted  
**Datum:** 2026-07-31

## Kontext

Kunden brauchen Hilfe zu Abläufen/Events und „Ticket vergessen“, ohne Sicherheits- oder Integritätsrisiken.

## Entscheidung

* Support-Modul von Phase 0/1 an einplanen (Schema, API, UI)
* Hybrid: Intent-Router + kuratierte Knowledge Base; LLM nur hinter Interface und nur grounded
* Mutierende Finanz-/Ticketaktionen ausschließlich über dedizierte Use Cases mit AuthZ — nie „vom Modell ausgeführt“
* Forgotten-Ticket anti-enumeration + magic link

## Konsequenzen

* Zusätzliche Tabellen und Admin-UI für Knowledge/Inbox
* Klare Produktkommunikation: Bot ≠ Alleskönner
* Später LLM austauschbar ohne Checkout-Kern zu berühren
