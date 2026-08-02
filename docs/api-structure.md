# API-Modulstruktur

**Status:** Entwurf  
**Basis:** `/api/v1`

## 1. Öffentlich

```text
GET  /public/events/:slug
GET  /public/artists/:slug
GET  /public/tours/:slug
GET  /public/legal/:type
POST /public/consent
POST /support/chat
POST /support/forgotten-ticket
POST /support/forgotten-ticket/verify
```

## 2. Auth & Account

```text
POST /auth/register | login | magic-link | logout
POST /auth/verify-email | reset-password
GET  /account/me
GET  /account/orders
GET  /account/orders/:id
GET  /account/tickets
POST /account/tickets/:id/transfer
POST /account/tickets/:id/resend
GET  /account/invoices/:id/download
POST /account/data-requests
```

## 3. Cart & Checkout

```text
POST /cart
POST /cart/items
DELETE /cart/items/:id
POST /cart/discount-codes
POST /cart/gift-cards
POST /checkout/start
POST /checkout/customer
POST /checkout/confirm   # „Zahlungspflichtig bestellen“
GET  /checkout/:id
```

Alle Preis-/Tax-Responses sind serverberechnet; Client sendet Absichten, keine finalen Beträge.

## 4. Payments

```text
POST /payments/webhooks/stripe
POST /payments/webhooks/paypal
GET  /payments/:id/status   # authenticated
```

## 5. Admin (org-scoped)

```text
/admin/organizations/:orgId/settings
/admin/artists|locations|tours|events|venue-plans
/admin/catalog|inventory|discounts|gift-cards
/admin/orders|tickets|customers
/admin/box-office|checkin|reports
/admin/tracking|accounting|emails|legal
/admin/users|roles|audit
/admin/support/knowledge|inbox|chats
```

## 6. Scanner & Box Office

```text
POST /scanner/sessions
GET  /scanner/events
POST /scanner/scan
POST /scanner/manual
GET  /scanner/stats

POST /box-office/sessions
POST /box-office/sales
POST /box-office/closings
```

## 7. Querschnitt

* `Authorization` Session/Cookie oder Bearer für Geräte
* `Idempotency-Key` auf Checkout confirm, refunds, resend
* `X-Request-Id` logging
* Zod schemas je Route
* Fehlerformat: `{ error: { code, message, details? } }`
