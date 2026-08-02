# Roadmap

**Status:** Entwurf  
**Stand:** 2026-07-31

## Phasenüberblick

| Phase | Fokus | Abhängigkeit |
|---|---|---|
| 0 | Fundament | — |
| 1 | Stammdaten + Support-Grundlagen | Phase 0 |
| 2 | Einfacher Ticketverkauf | Phase 1 |
| 3 | Scanner + Tageskasse | Phase 2 |
| 4 | Saalplan | Phase 2 (vertieft parallel nach 2 möglich) |
| 5 | Rabatte, Tourpakete, Transfer, Warteliste | Phase 2 |
| 6 | Tracking | Phase 2 |
| 7 | Buchhaltung / Lexware / Berichte | Phase 2 |
| 8 | Erweiterungen | Phase 3–7 |

## Phase 0 — Fundament

* Repo-Scaffold, TS strict, Tailwind, UI-Basis
* Postgres + Prisma, Redis, Local Compose
* Auth.js (Credentials + Magic Link), E-Mail-Verify/Reset
* Organizations, Memberships, RBAC, Audit-Log
* Designsystem / Admin-Shell Skeleton
* CI, Health checks, Docs/ADRs
* Support-Modul-Skeleton (Chat API stub klar markiert, Knowledge schema)

**Exit:** Login, Org anlegen, Rollen zuweisen, Audit-Eintrag, Tests grün.

## Phase 1 — Stammdaten

* Veranstalterstammdaten, Branding, Legal versions
* Künstler, Locations/Räume, Events, Touren
* Öffentliche Event-/Künstlerseiten
* E-Mail-Grundsystem (templates + queue)
* Support Knowledge Articles CRUD
* Chatbot FAQ (regelbasiert + Knowledge Retrieval) — **keine** Order-Mutation
* Forgotten-Ticket Request Pipeline (Magic Link) — anbindung an Orders in Phase 2 vervollständigen

**Exit:** SCHLAGERfeeling-Org pflegbar; Events öffentlich sichtbar; Hilfe-Chat antwortet auf FAQ.

## Phase 2 — Einfacher Ticketverkauf

Ohne grafischen Sitzplan:

* Kategorien, Kontingente, Cart, Holds
* Kundenkonto + Checkout + Legal accept
* Stripe Direct (PayPal vorbereitet)
* Webhooks → Order paid → Invoice → Tickets/QR/PDF → Mails
* Account Downloads
* Forgotten Ticket voll funktionsfähig
* Interne Verkaufsstatistik Basis

**Exit:** Akzeptanzkriterien 1–23 (+ Support 31–33 teilweise).

## Phase 3 — Scanner & Kasse

* Scanner-PWA, Check-in/out, Live-Stats
* Box Office UI, Zahlarten Bar/Terminal, Closing

**Exit:** Kriterien 27–29.

## Phase 4 — Saalplan

* Editor, Generator, Version lock, Seat selection, Best available

## Phase 5 — Pricing Extensions

* Discount engine, codes, gift cards, tour packages, transfers, waitlist

## Phase 6 — Tracking

* GA4/GTM/Meta/CAPI, internal funnel, attribution, deduped purchase

## Phase 7 — Accounting & Reports

* Corrections, Lexware adapter, fees, scheduled reports, exports

## Phase 8 — Later

* Wallet, Partner portal, resale, multi-tenant white-label, advanced automation
* LLM-Chatbot Vertiefung falls MVP regelbasiert startet

## Priorisierung für SCHLAGERfeeling Go-Live

Minimaler produktiver Pfad: **0 → 1 → 2 → 3**, parallel Vorbereitung 6/7. Saalplan (4) nur wenn nummerierte Sitze für erstes Event zwingend.
