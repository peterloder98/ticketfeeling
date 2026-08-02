# Rollen- und Rechtekonzept

**Status:** Entwurf  
**Stand:** 2026-07-31

## 1. Prinzipien

1. Autorisierung ausschließlich serverseitig.
2. Jede Permission ist ein stabiler Key (`resource:action`).
3. Rollen sind Bundles von Permissions; Org-Admins können keine System-Permissions vergeben.
4. Frontend blendet nur UX aus; APIs prüfen immer erneut.
5. Event-scoped Grants ergänzen Org-Rollen (z. B. Scanner nur Event X).
6. Sensitive Daten (Bank, Tracking Secrets) eigene Permissions.

## 2. Rollen

| Rolle | Key | Scope |
|---|---|---|
| Systemadministrator | `system_admin` | Plattformweit |
| Veranstalteradministrator | `organizer_admin` | Organisation |
| Eventmanager | `event_manager` | Organisation / Events |
| Buchhaltung | `accounting` | Organisation |
| Marketing | `marketing` | Organisation |
| Kundenservice | `customer_service` | Organisation |
| Tageskasse | `box_office` | Freigegebene Events |
| Einlassleitung | `gate_manager` | Zugewiesene Events |
| Scannerpersonal | `scanner` | Zugewiesene Events |
| Lesender Zugriff | `read_only` | Freigegebene Auswertungen |
| Kunde | `customer` | Eigenes Konto (separates Subject) |

## 3. Permission-Katalog (Auszug)

### Organisation & Benutzer

* `org:read`, `org:write`
* `bank:read`, `bank:write`
* `legal:read`, `legal:write`
* `users:read`, `users:write`
* `roles:read`, `roles:write`

### Inhalte

* `artists:read`, `artists:write`
* `locations:read`, `locations:write`
* `tours:read`, `tours:write`
* `events:read`, `events:write`, `events:publish`
* `venue_plans:read`, `venue_plans:write`, `venue_plans:lock`

### Verkauf

* `catalog:read`, `catalog:write`
* `inventory:read`, `inventory:write`
* `discounts:read`, `discounts:write`
* `gift_cards:read`, `gift_cards:write`
* `orders:read`, `orders:write`, `orders:refund`
* `tickets:read`, `tickets:resend`, `tickets:transfer_assist`, `tickets:void`
* `customers:read`, `customers:write`

### Operations

* `box_office:sell`, `box_office:close`
* `checkin:scan`, `checkin:manual_override`, `checkin:manage_devices`
* `reports:read`, `reports:export`
* `tracking:read`, `tracking:write` (secrets)
* `accounting:read`, `accounting:sync`
* `integrations:read`, `integrations:write`
* `audit:read` (kein `audit:delete`)
* `email:read`, `email:send_test`, `email:resend`

### Support

* `support:inbox`, `support:reply`
* `support:knowledge:write`
* `support:impersonate_read` (nur CS, eng begrenzt)

### System

* `platform:orgs:manage`
* `platform:config`
* `platform:logs`

## 4. Rollenmatrix (vereinfacht)

| Permission | Sys | OrgAdmin | EventMgr | Acct | Mkt | CS | Box | Gate | Scan | RO |
|---|---|---|---|---|---|---|---|---|---|---|
| org:write | ✓ | ✓ | | | | | | | | |
| bank:* | ✓ | ✓ | | ✓ read | | | | | | |
| events:publish | ✓ | ✓ | | | | | | | | |
| events:write | ✓ | ✓ | ✓ | | content* | | | | | |
| venue_plans:write | ✓ | ✓ | ✓ | | | | | | | |
| inventory:write | ✓ | ✓ | ✓ | | | | | | | |
| discounts:write | ✓ | ✓ | | | ✓ | | | | | |
| orders:refund | ✓ | ✓ | | ✓ | | limited* | | | | |
| tickets:resend | ✓ | ✓ | | | | ✓ | ✓ own sale | | | |
| box_office:sell | ✓ | ✓ | | | | | ✓ | | | |
| checkin:scan | ✓ | ✓ | | | | | | ✓ | ✓ | |
| checkin:manual_override | ✓ | ✓ | | | | | | ✓ | | |
| tracking:write | ✓ | ✓ | | | ✓ | | | | | |
| accounting:sync | ✓ | ✓ | | ✓ | | | | | | |
| reports:export | ✓ | ✓ | | ✓ | ✓ | | | | | ✓ read |
| audit:read | ✓ | ✓ | | ✓ | | ✓ | | | | |
| support:inbox | ✓ | ✓ | | | | ✓ | | | | |

\* Marketing darf Eventinhalte, nicht Preise/Kontingente ohne Freigabe.  
\* CS-Refund nur wenn Org-Policy es erlaubt (offen — siehe `open-decisions.md`).

## 5. Kunden-Subject

Kunden sind kein Staff-Membership. Zugriff über Customer-Session:

* eigene Bestellungen, Tickets, Rechnungen
* eigene Übertragungen
* eigene Support-Chats
* Datenexport / Löschantrag

Kein Zugriff auf fremde Bestellungen auch bei Kenntnis der Order-ID.

## 6. Durchsetzung

```text
requireAuth()
→ resolveMembership(orgId)
→ loadPermissionSet(membership + eventGrants)
→ assertPermission(needed)
→ execute use case
→ audit if sensitive
```

Scanner: zusätzlich `scanner_assignments(event_id, device_id?)`.

## 7. Audit-pflichtige Aktionen

Bankdaten, Preise, Steuern, Kontingente, Refunds, Freikarten, manuelle Check-ins, Ticket void/resend, Legal-Publish, Integration secrets, Role changes, Invoice corrections, Lexware manual mapping.
