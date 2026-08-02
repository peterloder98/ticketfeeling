# Offene fachliche & technische Entscheidungen

**Status:** Aktiv  
Bitte vor oder während Phase 0/1 klären.

## Fachlich

1. **Gastverkauf an der Tageskasse:** erlaubt ohne vollständiges Kundenkonto? (Prompt: nur wenn ausdrücklich freigegeben)
2. **Pflichtfelder Checkout:** Geschlecht/Geburtsdatum wirklich Pflicht für alle Events?
3. **CS-Refund-Rechte:** darf Kundenservice selbst erstatten oder nur anstoßen?
4. **Seat Hold TTL:** 10 Minuten fest oder je Event konfigurierbar?
5. **Multi-Event-Warenkorb:** fachlich freigeschaltet ab wann?
6. **Tourpaket Teilstorno:** Default-Policy
7. **Rechnungsart:** immer Vollrechnung vs. Kleinbetragsrechnungsschwellen
8. **Lexware-Strategie:** Beleg je Bestellung vs. Sammelbelege
9. **PayPal Go-Live-Priorität** neben Stripe
10. **Erstes Live-Event:** mit oder ohne nummerierte Sitze (bestimmt Phase-4-Druck)
11. **Chatbot:** Phase-1 rein regelbasiert vs. LLM+RAG sofort
12. **Support-SLA / Handoff-Kanal:** E-Mail, Inbox only, später Zendesk o. Ä.?

## Technisch

1. Monorepo (Turborepo) vs. Single Next App
2. Hosting-Provider (Vercel+Worker vs. Container-Platform)
3. Object Storage (R2 vs S3 vs andere)
4. E-Mail-Provider (Resend vs Postmark vs SES)
5. Stripe Direct Charge vs Stripe Connect Express Details
6. PDF-Engine (`@react-pdf/renderer` vs HTML→PDF)
7. API-Stil: REST-only vs Server Actions + REST für externe Clients
8. Token-at-rest: hash-only vs encrypted reversible for support display
9. Offline-Scanner Konfliktresolution finalisieren
10. 2FA Enforcement-Zeitpunkt für Admins

## Annahmen bis zur Klärung

| Thema | Annahme |
|---|---|
| Geld | BIGINT Cent |
| Tax default tickets | 7 % als Org-Vorlage, konfigurierbar |
| Payments first | Stripe Direct für SCHLAGERfeeling |
| Hold TTL | 10 Minuten, org-override möglich |
| Chatbot MVP | Regeln + Knowledge Retrieval; LLM optional hinter Interface |
| PDF | `@react-pdf/renderer` |
| Repo layout | `apps/web` + `packages/database` |
| Forgotten ticket | Magic link, 30 Minuten TTL |
