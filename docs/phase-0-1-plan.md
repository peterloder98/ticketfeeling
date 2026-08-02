# Umsetzungsplan Phase 0 & Phase 1

**Status:** Bereit nach Dokumentationsprüfung  
**Kein produktiver Verkaufscode vor Freigabe dieser Grundlage.**

## Phase 0 — Fundament (konkret)

### Ziele

Produktionsfähiges Fundament ohne Ticketverkauf: Auth, Org, RBAC, Audit, Tooling, Support-Skeleton.

### Arbeitspakete

1. **Scaffold**
   * Next.js App Router, TypeScript strict, ESLint, Prettier
   * Tailwind + shadcn/ui Basis
   * `packages/database` mit Prisma
   * Docker Compose: Postgres 16, Redis, Mailpit, MinIO
   * Env-Beispiel `.env.example` (keine Secrets)

2. **Datenbank Kern**
   * organizations, organization_settings, organization_bank_accounts (encrypted stub)
   * users + Auth.js tables
   * memberships, roles, permissions, role maps
   * audit_logs (append-only; no delete API)
   * files metadata
   * support_knowledge_articles, support_chat_sessions/messages, forgotten_ticket_requests (leer nutzbar)

3. **Auth**
   * E-Mail/Passwort, Magic Link
   * Verify + Reset Flows
   * Session hardening
   * Rate limits login/magic/forgotten endpoints

4. **RBAC**
   * Seed System- + Org-Rollen
   * `requirePermission` helper
   * Admin-Shell mit navigationsseitiger Ausblendung **und** Server Checks

5. **Audit**
   * Middleware/service `writeAudit`
   * Tests: role change schreibt Audit

6. **Designsystem / Shells**
   * Public layout skeleton
   * Admin layout + nav laut Prompt §42 (viele Einträge disabled/coming soon klar markiert)
   * Support/Hilfe Seiten-Shell

7. **CI & Quality**
   * Vitest + 1 Playwright smoke (health/login)
   * GitHub Actions: lint, typecheck, test, migrate
   * Health endpoint

8. **Docs**
   * ADR-001..003 committen
   * README mit Startanleitung

### Abnahmeliste Phase 0

- [ ] `docker compose up` startet Abhängigkeiten
- [ ] Migrationen laufen clean
- [ ] User kann sich registrieren/einloggen/magic link
- [ ] Org „SCHLAGERfeeling“ seedbar
- [ ] Org-Admin kann Member + Rolle zuweisen
- [ ] Eventmanager sieht keine Bankdaten-API
- [ ] Audit speichert Role-Change
- [ ] Support-Chat Endpoint antwortet mit **explizitem Stub/FAQ-Platzhalter** oder Knowledge-hit — nie als „vollständige KI“ verkaufen
- [ ] CI grün

### Explizit nicht in Phase 0

Checkout, Payments, Tickets, Lexware, Seat maps, Tracking pixels.

---

## Phase 1 — Stammdaten + Support-Grundlagen

### Ziele

Veranstalter kann Events und Künstler pflegen und öffentlich zeigen; Hilfe-Chat beantwortet kuratierte FAQ; Ticket-vergessen-Pipeline technisch vorbereitet (voll nutzbar mit Orders in Phase 2).

### Arbeitspakete

1. **Organizer Stammdaten UI + API**
   * Allgemeine Angaben, Branding (Logo S3), Legal documents + versions
   * Bank fields encrypted; permission-gated

2. **Künstler**
   * CRUD, media/rights basics, public `/kuenstler/[slug]`
   * YouTube Zwei-Klick-Component

3. **Locations & Rooms**
   * CRUD + travel info

4. **Events & Tours**
   * CRUD, status model (subset), schedule fields
   * Public `/event/[slug]` mit Vorverkaufs-Hinweis/Countdown (ohne Kauf)
   * Event-Artist assignment

5. **E-Mail Grundsystem**
   * Template table, BullMQ send worker, Mailpit local
   * Magic link / verify templates produktionsnah

6. **Support**
   * Knowledge articles admin
   * Chat intent router: faq + event_info + forgotten_ticket + handoff
   * Forgotten-ticket request + generic response + mail sender (match against customers/orders when present; otherwise no-op mail path)
   * Audit/resend event tables wired

### Abnahmeliste Phase 1

- [ ] Org-Stammdaten inkl. Legal Version publish
- [ ] Künstler/Location/Event/Tour anlegbar
- [ ] Public Event- und Künstlerseite
- [ ] FAQ-Artikel werden vom Chatbot korrekt zitiert/verlinkt
- [ ] Event-Info-Intent liefert nur veröffentlichte Daten
- [ ] Ticket-vergessen Endpoint rate-limited + anti-enumeration
- [ ] Keine Preis-/Checkout-Funktion „fertig“ markiert
- [ ] Migrationen + Tests + Kurz-Doku Update

### Übergang zu Phase 2

Nach Freigabe: Catalog/Inventory/Cart/Checkout/Payments gemäß `roadmap.md`.
