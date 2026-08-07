# Go-live checklist (Ticketfeeling)

Short ops checklist before / during production cutover. Details: `deployment.md`, `tse-plan.md`, `wallet-passes.md`.

## 1. Secrets & auth

| Item | Notes |
|---|---|
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | Long random (≥32 bytes). Required for sessions. |
| `AUTH_URL` / `NEXTAUTH_URL` | Public app URL (https). |
| `ORDER_ACCESS_SECRET` | Optional dedicated secret for guest order links (`?t=`). Falls back to NEXTAUTH/AUTH secret — set a dedicated value in production. |
| `FIELD_ENCRYPTION_KEY` | 32-byte hex for encrypted org fields. |
| `CRON_SECRET` | Bearer for Vercel cron routes (payouts, expire-holds). |

**Seed admin:** Local seed uses `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (defaults in README). **Never** leave the seed password on a production database — change or remove the seed user before go-live.

## 2. Payments (Stripe live)

| Item | Notes |
|---|---|
| `PAYMENT_PROVIDER=stripe` | Not `dev`. |
| `STRIPE_SECRET_KEY` | Live `sk_live_…` |
| `STRIPE_PUBLISHABLE_KEY` | Live `pk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | From Stripe Dashboard webhook endpoint |
| Webhook URL | `https://<app>/api/v1/payments/stripe/webhook` (confirm path in deploy) |
| Terminal (optional) | `STRIPE_TERMINAL_LOCATION_ID` for Tap to Pay / Tageskasse |

## 3. Email (SMTP)

Configure an organization email account (or org SMTP settings). Production `/api/health` warns when SMTP is missing — ticket mails will stub.

## 4. Embeds

| Item | Notes |
|---|---|
| `EMBED_FRAME_ANCESTORS` | Space/comma-separated parent origins (e.g. `https://schlagerfeeling.de https://www.schlagerfeeling.de`). Unset/`*` allows any parent; **production health warns**. |
| `NEXT_PUBLIC_APP_URL` | Canonical public URL for snippets, mails, redirects. |

## 5. Rate limits (optional)

| Item | Notes |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Shared rate limits across Vercel instances. |
| or `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel KV (same REST client). |
| `REDIS_URL` | Documented for local Redis; serverless uses REST above. Without Redis → in-memory limits (still OK, not multi-instance). |

## 6. Order-access TTL vs schedule-change

| Flow | Token TTL | Where |
|---|---|---|
| Checkout pay / confirmation (`?t=`) | **2 hours** (default) | `signOrderAccessToken()` |
| Ticket e-mail / forgotten-ticket / schedule-change buyer mail | **30 days** | Explicit `30 * 24 * 60 * 60 * 1000` |

Schedule-change notifications intentionally use the longer TTL so buyers can open tickets after a date/venue update. Short checkout tokens are only for the immediate pay/confirm window. Support: if a checkout link expired, resend tickets or use forgotten-ticket (30d).

## 7. Compliance stubs (not live integrations)

* **TSE / Fiskaly:** Modes `planned` / `fiskaly` record stubs — **keine echte TSE-Signatur**. Do not claim KassenSichV compliance until Fiskaly (or external TSE) is wired and tax advisor signed off. See `tse-plan.md`.
* **Lexware / Lexoffice:** Accounting provider is a **stub** (audit + snapshot only). Admin “Lexoffice markieren” on Stripe payouts is manual bookkeeping — not the Lexoffice API.

## 8. Smoke after deploy

1. `GET /api/health` → `ok`, `db: up`, review `warnings` (SMTP, embed allowlist).
2. Test checkout with live Stripe (small amount) → tickets + mail.
3. Cron: expire-holds / payouts with `Authorization: Bearer $CRON_SECRET`.
4. Embed on allowlisted parent (if restricted).
5. Scanner check-in on a real ticket QR.
