# Systemarchitektur — Ticketfeeling

**Status:** Entwurf  
**Stand:** 2026-07-31

## 1. Architekturstil

Modularer Monolith (Next.js) mit klaren Domain-Modulen, serverseitigen Use-Cases und asynchroner Verarbeitung über Redis/BullMQ.

**Annahme:** Ein Deployable für Web/Admin/API-Routen in Phase 0–3; Worker-Prozess separat für Queues. Spätere Extraktion von Services möglich, ohne Domaingrenzen zu zerstören.

```text
┌─────────────────────────────────────────────────────────────┐
│                     Clients                                  │
│  Public Shop │ Embed Widget │ Admin │ Kasse │ Scanner-PWA   │
│  Chatbot Widget │ Kundenkonto                                │
└───────────────┬─────────────────────────────┬───────────────┘
                │ HTTPS                       │
┌───────────────▼─────────────────────────────▼───────────────┐
│                 Next.js App (App Router)                     │
│  UI (RSC/Client) │ Route Handlers / tRPC-or-REST │ Auth.js  │
│  Domain Services │ Zod Validation │ RBAC Guards              │
└───────┬───────────────┬──────────────────┬──────────────────┘
        │               │                  │
   ┌────▼────┐    ┌─────▼─────┐     ┌──────▼──────┐
   │Postgres │    │Redis/BullMQ│     │ S3 Objects  │
   └─────────┘    └─────┬─────┘     └─────────────┘
                        │
              ┌─────────▼─────────┐
              │ Worker Processes  │
              │ PDF │ Mail │ Sync │
              │ Webhooks │ Reports│
              │ Holds expire      │
              └─────────┬─────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   Stripe/PayPal   Lexware Office   E-Mail Provider
   Meta CAPI/GA4   LLM/Support (opt)
```

## 2. Schichten

| Schicht | Verantwortung |
|---|---|
| Presentation | Next.js Pages/Layouts, barrierearme UI, Scanner-PWA, Kasse |
| Application / Use Cases | Orchestrierung: Checkout, Payment finalize, Refund, Check-in |
| Domain | Entities, State Machines, Pricing Rules, Inventory |
| Infrastructure | Prisma, Queue, S3, Stripe, Mail, Lexware, Tracking adapters |
| Cross-cutting | Auth, RBAC, Audit, Consent, Observability, Encryption |

## 3. Mandantenfähigkeit

Jeder geschäftlich relevante Datensatz trägt `organization_id`.

Zugriffspfad:

```text
Auth Session → memberships → organization_id → resource.organization_id match
(+ optionale event-scoped Grants)
```

URL-IDs allein reichen nie aus. Alle Queries sind organization-scoped (Prisma Middleware / Query Extensions empfohlen).

## 4. Modulstruktur (logisch)

```text
auth                 — Login, Magic Link, Sessions, 2FA prep
organizations        — Stammdaten, Settings, Bank, Legal texts
rbac                 — Roles, Permissions, Grants
artists              — Künstler, Medien, Rechte
locations            — Locations, Rooms, Travel
tours                — Touren, Pakete
events               — Events, Status, Changes
venue-plans          — Saalplan-Editor, Versionen, Seats
catalog              — Categories, Add-ons, Tax rates
inventory            — Pools, Holds, Movements
pricing              — Discount engine, Gift cards
cart                 — Cart, Holds TTL
checkout             — Order creation, legal acceptance
payments             — Providers, webhooks, refunds
orders               — Orders, items, snapshots
invoicing            — Invoices, corrections, number series
tickets              — Tickets, QR, PDF, transfers, resend
checkin              — Scanner, check-in/out, stats
box-office           — Tages-/Abendkasse, cash closing
customers            — Accounts, addresses, consents
support              — Chatbot, forgotten ticket, handoff
tracking             — Internal events, attribution, pixels
consent              — CMP categories & snapshots
email                — Templates, delivery, reports
accounting           — AccountingProvider, Lexware adapter
reports              — Daily/weekly/monthly
audit                — Immutable audit log
files                — Object storage metadata
admin                — Dashboard shells
```

## 5. API-Struktur

**Annahme:** Route Handlers unter `/api/v1/...` + Server Actions für Admin-Formulare. Öffentliche Embed-/Scanner-Clients nutzen REST/JSON. Interne UI kann Server Actions nutzen, aber Geschäftsregeln liegen in Domain Services.

Module (Auszug):

```text
/api/v1/auth/*
/api/v1/orgs/:orgId/...
/api/v1/public/events/:slug
/api/v1/public/artists/:slug
/api/v1/cart/*
/api/v1/checkout/*
/api/v1/payments/webhooks/:provider
/api/v1/account/*
/api/v1/support/chat
/api/v1/support/forgotten-ticket
/api/v1/scanner/*
/api/v1/box-office/*
/api/v1/admin/*
```

Alle mutierenden Endpunkte: Zod-Validierung, Auth, RBAC, Audit wo nötig, Idempotency-Keys für Zahlungen/Refunds.

## 6. Asynchrone Jobs

| Job | Trigger |
|---|---|
| `expire-seat-holds` | Scheduler |
| `generate-ticket-pdf` | Order paid |
| `generate-invoice-pdf` | Invoice finalized |
| `send-email` | Diverse Domain Events |
| `process-webhook` | Webhook inbox |
| `sync-accounting` | Invoice/payment events |
| `emit-purchase-tracking` | Paid + tickets issued |
| `generate-report` | Schedules |
| `support-knowledge-reindex` | Content publish |

## 7. Zahlungsarchitektur (kritisch)

* Veranstalter verbindet eigenen Stripe-Account (Direct) / PayPal Business.
* Checkout erzeugt Payment Intent auf dem Connected/Direct Account des Veranstalters.
* Ticketfeeling speichert keine Kartendaten.
* Finalisierung nur über signierte, idempotente Webhooks → State Machine → Order paid → Invoice/Tickets.

Siehe `payment-state-machine.md`, `accounting-concept.md`.

## 8. Support-/Chatbot-Architektur

```text
Client Chat Widget
  → POST /api/v1/support/chat
    → Intent classifier
      → FAQ/RAG (public knowledge)
      → Forgotten ticket flow (rate-limited)
      → Authenticated order lookup
      → Create support request (handoff)
    → Persist chat_sessions / chat_messages
    → Never mutate tickets/payments directly
```

## 9. Sicherheitsgrenzen

* Browser berechnet nie verbindliche Preise/Kapazitäten.
* QR-Token kryptografisch zufällig; Validierung nur Server.
* Bank-/Provider-Secrets verschlüsselt at rest (KMS/app-level).
* Embed: Origin-Whitelist + `postMessage`-Validierung.

## 10. Vorgeschlagene Ordnerstruktur

```text
/
├── apps/
│   └── web/                      # Next.js App
│       ├── app/
│       │   ├── (public)/
│       │   ├── (account)/
│       │   ├── (admin)/
│       │   ├── (box-office)/
│       │   ├── (scanner)/
│       │   ├── (support)/        # Hilfe, Ticket vergessen
│       │   └── api/v1/
│       ├── components/
│       ├── modules/              # Domain modules
│       │   ├── auth/
│       │   ├── organizations/
│       │   ├── events/
│       │   ├── inventory/
│       │   ├── checkout/
│       │   ├── payments/
│       │   ├── tickets/
│       │   ├── support/          # chatbot + forgotten ticket
│       │   └── ...
│       ├── lib/
│       └── workers/              # BullMQ processors (or apps/worker)
├── packages/
│   ├── database/                 # Prisma schema + client
│   ├── config/                   # ESLint, TS, Tailwind
│   ├── ui/                       # Design system
│   └── domain/                   # Shared pure domain logic (optional)
├── docs/
│   ├── architecture-decisions/
│   └── ...
├── e2e/
└── README.md
```

**Annahme:** Turborepo-ähnliches Layout (`apps/` + `packages/`). Alternativ Single-App ohne Packages in Phase 0, Migration später — Entscheidung in ADR-001.

## 11. ADRs

Größere Entscheidungen unter `/docs/architecture-decisions/`.
