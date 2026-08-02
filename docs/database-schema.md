# Datenbankschema — Ticketfeeling

**Status:** Entwurf  
**DB:** PostgreSQL 16  
**ORM:** Prisma  
**Geldwerte:** `BIGINT` in Cent (oder `DECIMAL(19,4)` für Gebühren mit Feinanteil — Annahme: **Cent als BIGINT** für Produktpreise/Order Totals; Provider-Fees als BIGINT Cent)  
**Währung:** immer explizit (`EUR` default)  
**Mandant:** `organization_id` auf allen geschäftlichen Tabellen

## 1. Konventionen

* Primärschlüssel: UUID (`gen_random_uuid()`)
* Zeitstempel: `timestamptz`
* Soft-Delete nur wo fachlich nötig; Audit bleibt
* Unveränderliche Snapshots bei Order/Invoice/Ticket-Ausgabe
* Unique Constraints für Geschäftsintegrität (Seat sold once, invoice number, QR token)
* Keine Floating-Point-Geldbeträge

## 2. Kernentitäten (Überblick)

### 2.1 Platform & Access

```text
organizations
organization_settings
organization_bank_accounts          -- encrypted fields
users
credentials / auth_accounts         -- Auth.js tables
sessions
verification_tokens
memberships                         -- user ↔ org
roles
permissions
role_permissions
membership_roles
event_grants                        -- optional event-scoped access
audit_logs                          -- append-only
```

### 2.2 Legal & Consent

```text
legal_documents                     -- impressum, privacy, AGB, ...
legal_document_versions             -- version, valid_from, status, content
order_legal_acceptances             -- snapshot of versions accepted
consent_versions
customer_consents
visitor_consents                    -- anonymous CMP
```

### 2.3 Catalog / Content

```text
artists
artist_media
artist_videos
artist_rights
locations
location_rooms
location_travel_information
tours
tour_events
tour_packages
tour_package_items
events
event_artists
event_versions
event_change_notifications
files                               -- S3 metadata
```

### 2.4 Venue Plans

```text
venue_plans
venue_plan_versions                 -- immutable after sale lock
venue_plan_elements
venue_areas
venue_blocks
venue_rows
venue_seats                         -- immutable seat UUID
```

### 2.5 Inventory & Pricing

```text
tax_rates                           -- org-configurable 0/7/19/...
ticket_categories
event_ticket_categories
category_benefits                   -- VIP Leistungen
addon_products
inventory_pools
inventory_movements                 -- append-only
discount_rules
discount_codes
discount_redemptions
gift_cards
gift_card_transactions              -- ledger
```

### 2.6 Cart / Orders / Payments

```text
carts
cart_items
seat_holds
orders
order_items                         -- price/tax snapshots
payments
payment_events                      -- provider raw + normalized
refunds
webhook_inbox
webhook_processing_attempts
```

### 2.7 Invoicing & Accounting

```text
invoice_number_sequences
invoices
invoice_items
invoice_corrections
accounting_integrations
accounting_sync_jobs
```

### 2.8 Tickets & Check-in

```text
tickets
ticket_qr_tokens                    -- active/rotated
ticket_transfers
ticket_documents                    -- PDF versions in S3
checkin_events
scanner_devices
scanner_assignments
```

### 2.9 Box Office

```text
box_office_sessions
cash_movements
cash_closings
```

### 2.10 Customers

```text
customers                           -- org-scoped customer profile
customer_addresses
customer_preferences
data_subject_requests               -- export/delete
```

### 2.11 Tracking & Reports

```text
tracking_integrations
tracking_sessions
tracking_events
attribution_touches
report_schedules
report_recipients
generated_reports
```

### 2.12 Email & Jobs

```text
email_templates
email_messages
email_delivery_events
background_jobs                     -- optional mirror of queue
```

### 2.13 Support (Chatbot + Ticket vergessen)

```text
support_knowledge_articles          -- curated FAQ / public facts
support_chat_sessions
support_chat_messages
support_requests                    -- human handoff
forgotten_ticket_requests           -- rate-limited recovery attempts
ticket_resend_events                -- audit of resends
```

## 3. Wichtige Relationen (vereinfacht)

```text
organizations 1─n events
events n─1 locations / rooms
events n─n artists (event_artists)
events 1─n event_ticket_categories
event_ticket_categories n─1 tax_rates
events 1─n inventory_pools
carts 1─n cart_items / seat_holds
orders 1─n order_items / payments / invoices / tickets
tickets 1─n ticket_qr_tokens / checkin_events
gift_cards 1─n gift_card_transactions
orders n─n legal_document_versions (via order_legal_acceptances)
customers 1─n orders / forgotten_ticket_requests
```

## 4. Kritische Constraints

### Seat uniqueness

```sql
-- Nur ein aktives Hold/Sale pro Seat+Event
UNIQUE (event_id, venue_seat_id) WHERE status IN ('held','sold')
-- Umsetzung: partial unique indexes + transactional locks
```

### Inventory

```sql
CHECK (sold_quantity + held_quantity + reserved_internal <= capacity)
-- zusätzlich movements ledger; capacity changes never invalidate sold tickets
```

### Invoice numbers

```sql
UNIQUE (organization_id, invoice_number)
```

### QR tokens

```sql
UNIQUE (token_hash)
-- store hash at rest; raw token only in PDF/secure channel
```

### Payments idempotency

```sql
UNIQUE (provider, provider_event_id) ON webhook_inbox
UNIQUE (provider, provider_payment_id) ON payments WHERE provider_payment_id IS NOT NULL
```

## 5. Exemplarische Prisma-Modelle (Phase 0 Kern)

> Vollständiges Schema wächst phasenweise. Phase 0 implementiert Organisation, User, RBAC, Audit, Settings.

```prisma
model Organization {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  slug      String   @unique
  status    String   // active|suspended
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  settings     OrganizationSettings?
  bankAccounts OrganizationBankAccount[]
  memberships  Membership[]
  auditLogs    AuditLog[]

  @@map("organizations")
}

model OrganizationSettings {
  id               String @id @default(uuid()) @db.Uuid
  organizationId   String @unique @map("organization_id") @db.Uuid
  defaultCurrency  String @default("EUR") @map("default_currency")
  defaultTimezone  String @default("Europe/Berlin") @map("default_timezone")
  defaultLocale    String @default("de-DE") @map("default_locale")
  ticketShopDomain String? @map("ticket_shop_domain")
  // branding, tax ids, support emails as JSON or columns
  data             Json   @default("{}")

  organization Organization @relation(fields: [organizationId], references: [id])

  @@map("organization_settings")
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  emailVerified DateTime? @map("email_verified")
  name         String?
  passwordHash String?  @map("password_hash")
  status       String   @default("active")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  memberships Membership[]
  auditLogs   AuditLog[]

  @@map("users")
}

model Membership {
  id             String @id @default(uuid()) @db.Uuid
  organizationId String @map("organization_id") @db.Uuid
  userId         String @map("user_id") @db.Uuid
  status         String @default("active")

  organization Organization @relation(fields: [organizationId], references: [id])
  user         User         @relation(fields: [userId], references: [id])
  roles        MembershipRole[]

  @@unique([organizationId, userId])
  @@map("memberships")
}

model Role {
  id             String  @id @default(uuid()) @db.Uuid
  organizationId String? @map("organization_id") @db.Uuid // null = system role template
  key            String  // organizer_admin, box_office, ...
  name           String
  isSystem       Boolean @default(false) @map("is_system")

  permissions RolePermission[]
  memberships MembershipRole[]

  @@unique([organizationId, key])
  @@map("roles")
}

model Permission {
  id          String @id @default(uuid()) @db.Uuid
  key         String @unique // orders:read, bank:write, ...
  description String

  roles RolePermission[]

  @@map("permissions")
}

model RolePermission {
  roleId       String @map("role_id") @db.Uuid
  permissionId String @map("permission_id") @db.Uuid

  role       Role       @relation(fields: [roleId], references: [id])
  permission Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
  @@map("role_permissions")
}

model MembershipRole {
  membershipId String @map("membership_id") @db.Uuid
  roleId       String @map("role_id") @db.Uuid

  membership Membership @relation(fields: [membershipId], references: [id])
  role       Role       @relation(fields: [roleId], references: [id])

  @@id([membershipId, roleId])
  @@map("membership_roles")
}

model AuditLog {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String?  @map("organization_id") @db.Uuid
  actorUserId    String?  @map("actor_user_id") @db.Uuid
  action         String
  entityType     String   @map("entity_type")
  entityId       String?  @map("entity_id")
  before         Json?
  after          Json?
  reason         String?
  ip             String?
  userAgent      String?  @map("user_agent")
  requestId      String?  @map("request_id")
  createdAt      DateTime @default(now()) @map("created_at")

  organization Organization? @relation(fields: [organizationId], references: [id])
  actor        User?         @relation(fields: [actorUserId], references: [id])

  @@index([organizationId, createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

## 6. Support-Modelle (Phase 1 vorbereiten)

```prisma
model SupportKnowledgeArticle {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  slug           String
  title          String
  body           String
  locale         String   @default("de-DE")
  tags           String[]
  visibility     String   // public|authenticated|internal
  status         String   // draft|published
  publishedAt    DateTime? @map("published_at")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([organizationId, slug, locale])
  @@map("support_knowledge_articles")
}

model SupportChatSession {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  customerId     String?  @map("customer_id") @db.Uuid
  visitorId      String?  @map("visitor_id")
  channel        String   // widget|account|help_page
  status         String   // open|handed_off|closed
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  messages SupportChatMessage[]

  @@index([organizationId, createdAt])
  @@map("support_chat_sessions")
}

model SupportChatMessage {
  id        String   @id @default(uuid()) @db.Uuid
  sessionId String   @map("session_id") @db.Uuid
  role      String   // user|assistant|system|agent
  content   String
  intent    String?
  sources   Json?    // grounded article ids
  createdAt DateTime @default(now()) @map("created_at")

  session SupportChatSession @relation(fields: [sessionId], references: [id])

  @@index([sessionId, createdAt])
  @@map("support_chat_messages")
}

model ForgottenTicketRequest {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  emailNormalized String  @map("email_normalized")
  orderNumberHint String? @map("order_number_hint")
  eventIdHint     String? @map("event_id_hint") @db.Uuid
  ipHash          String  @map("ip_hash")
  status          String  // received|matched|sent|rate_limited|failed
  matchedOrderId  String? @map("matched_order_id") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at")

  @@index([organizationId, emailNormalized, createdAt])
  @@map("forgotten_ticket_requests")
}
```

## 7. Order / Ticket / Payment Kernfelder (Phase 2)

Geld und Snapshots:

* `unit_price_gross_cents`, `unit_price_net_cents`
* `tax_rate_bps` (z. B. 700 = 7,00 %)
* `discount_cents`, `gift_card_cents`, `fee_cents`
* `currency`
* `product_name_snapshot`, `event_name_snapshot`, `seat_label_snapshot`

Seat hold:

* `expires_at`, `status` (`held|consumed|expired|released`)
* Default TTL **10 Minuten** (konfigurierbar je Org)

## 8. Indizes (Priorität)

* `(organization_id, created_at)` auf orders, payments, tickets, audit_logs
* `(event_id, status)` auf tickets, inventory
* `(email_normalized)` auf customers
* Partial uniques für active holds/QR
* `(provider, provider_event_id)` webhook_inbox

## 9. Migrationsstrategie

* Prisma Migrate, eine Migration pro Phase-Meilenstein
* Keine destruktiven Changes ohne Expand/Contract
* Seed: Systemrollen, Permissions, Demo-Org „SCHLAGERfeeling“ (non-prod)
