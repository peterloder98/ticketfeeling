# Teststrategie

**Status:** Entwurf

## 1. Pyramide

* **Unit:** Domain (pricing, tax split, state transitions, discount rules)
* **Integration:** Prisma + services, webhook inbox, seat holds, inventory
* **API:** AuthZ matrix, checkout, support endpoints
* **E2E (Playwright):** Happy path Kauf → Mail/PDF stubs → Account download → Scan
* **Load/Concurrency:** seat races, sale start, duplicate webhooks, multi-scanner

## 2. Muss-Szenarien

1. Gleichzeitige Reservierung desselben Sitzes → genau ein Gewinner
2. Doppelter Payment-Webhook → genau eine Ticket-/Invoice-Erzeugung
3. Rabattkombinationen / Prioritäten
4. QR-Wiederverwendung nach Check-in → Rot
5. Teilstorno + Korrekturbeleg + Tax split
6. Forgotten ticket: Enumeration unmöglich; Match sendet Link
7. Chatbot: keine Refund/Void-Aktion ohne Agent
8. RBAC: Eventmanager kann Bankdaten nicht lesen
9. Legal version snapshot an Order
10. Invoice number uniqueness under concurrency

## 3. Tooling-Annahme

* Vitest für Unit/Integration
* Playwright für E2E
* Testcontainers oder dedizierte Test-Postgres/Redis in CI
* Provider webhooks via signed fixture payloads

## 4. Qualitätsgates je Phase

Migrationen + Tests + Docs + Security checklist + Acceptance list.
