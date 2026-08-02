# Kunden-Chatbot & Ticket vergessen

**Status:** Entwurf  
**Stand:** 2026-07-31  
**Pflicht ab Architekturphase:** Ja — Datenmodell, API, UI-Slots und Sicherheitsgrenzen von Anfang an einplanen.

## 1. Ziele

* Wichtige Fragen zu Abläufen und Events schnell beantworten
* „Ticket vergessen“ Self-Service ohne Enumeration-Risiko
* Entlastung Kundenservice; klare Eskalation an Menschen
* Keine Umgehung von Zahlungs-/Ticket-Integrität

## 2. Produktoberflächen

| Ort | Verhalten |
|---|---|
| `/hilfe` | Hilfe-Center + Chat |
| `/hilfe/ticket-vergessen` | Dedizierter Recovery-Flow |
| Eventseiten / Shop | Schwebendes Chat-Widget (consent: necessary for support UX; analytics optional) |
| Kundenkonto | Authentifizierter Chat mit Bestellkontext |
| Admin | Knowledge Base, Chat-Logs (PII-minimiert), Support-Inbox |

## 3. Intents (MVP)

1. `faq_general` — Kauf, Zahlung, Einlass, AGB-Hinweise (Links, keine Rechtsberatung)
2. `event_info` — Datum, Location, Einlass, Vorverkauf (public fields)
3. `forgotten_ticket` — startet Recovery-Flow
4. `order_status` — nur authenticated / magic-link session
5. `resend_tickets` — authenticated oder verified recovery
6. `handoff_human` — Support Request erzeugen
7. `fallback` — sichere Standardantwort + Handoff-Angebot

## 4. Architektur

```text
Widget → POST /api/v1/support/chat
  1. Validate + rate limit
  2. Resolve org/event context
  3. Classify intent
  4. If forgotten_ticket → /forgotten-ticket use case
  5. If event_info/faq → retrieve published knowledge + public event projection
  6. If order_* → require authz
  7. Persist session/messages + sources
  8. Return answer + suggested actions
```

### Annahmen

* **Phase 1:** Regelbasierter Intent-Router + Keyword/Embedding-Retrieval über `support_knowledge_articles`
* **Phase 2+:** Optional LLM mit strict grounding; wenn unsicher → Handoff
* Provider hinter `SupportChatProvider` austauschbar

## 5. Ticket-vergessen Use Case

### Input

* E-Mail (required)
* optional Bestellnummer, Event

### Server

1. Normalize email
2. Rate limit by email hash + IP hash
3. Captcha verify
4. Lookup paid orders for org (timing-safe path)
5. Always return generic success to client
6. On match: create one-time token, enqueue mail with magic link
7. Log `forgotten_ticket_requests`
8. Landing: verify token → show tickets/invoices → allow resend

### Nicht erlaubt

* Antwort „E-Mail unbekannt“
* Ticket-PDF ohne Token/Session
* QR im Chat im Klartext vor Auth

## 6. Sicherheits- & Compliance-Grenzen

* Bot kann nicht: refund, void, change seats, alter prices, expose bank/tracking secrets
* PII in Chat-Logs: Retention-Policy, Masking in Admin-Listen
* Knowledge articles: keine internen Sicherheitsinfos öffentlich
* Alle Resends auditen (`ticket_resend_events`)

## 7. Erfolgsmetriken

* Containment rate (ohne Handoff gelöst)
* Forgotten-ticket completion rate
* Missbrauchsalarme (Rate-Limit hits)
* CSAT optional später

## 8. Abnahmekriterien

1. FAQ zu „Wie erhalte ich meine Tickets?“ führt zu Ticket-vergessen oder Account-Login.
2. Unbekannte E-Mail und bekannte E-Mail liefern identische UI-Response.
3. Match sendet E-Mail mit zeitlich begrenztem Link.
4. Chatbot erfindet keine Eventzeiten — nur DB/public knowledge.
5. Unklare Rechts-/Erstattungsfragen → Link auf Policy + Handoff.
