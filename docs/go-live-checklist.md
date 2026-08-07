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
| `EMBED_FRAME_ANCESTORS` | Space/comma-separated parent origins. **Local:** unset/`*` is fine. **Production:** allowlist e.g. `https://ticketfeeling.de https://www.ticketfeeling.de https://ticketfeeling-web.vercel.app` — **append each organizer site** that embeds tickets. Health warns if still `*`/`unset`. |
| `NEXT_PUBLIC_APP_URL` | Canonical public URL for snippets, mails, redirects. |

## 5. Rate limits (Upstash / Vercel KV)

Shared limits across Vercel instances. Code already prefers REST when env is present (`apps/web/src/lib/security/rate-limit.ts`); without it → in-memory (OK for low traffic, not multi-instance).

**How to enable (no fake keys):**

1. Vercel Dashboard → project **ticketfeeling-web** → **Storage** → Create **Upstash Redis** or **KV** → link to the project (injects `UPSTASH_REDIS_REST_URL` + `TOKEN`, or `KV_REST_API_*`).
2. Or create a database at [upstash.com](https://upstash.com) → copy REST URL + token into Vercel env.
3. Redeploy. Confirm `GET /api/health` → `"rateLimit": "redis"`.

| Item | Notes |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Preferred |
| or `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Vercel KV (same client) |
| `REDIS_URL` | Local TCP Redis only; **not** read by serverless rate-limit |

## 6. Order-access TTL vs schedule-change

| Flow | Token TTL | Where |
|---|---|---|
| Checkout pay / confirmation (`?t=`) | **2 hours** (default) | `signOrderAccessToken()` |
| Ticket e-mail / forgotten-ticket / schedule-change buyer mail | **30 days** | Explicit `30 * 24 * 60 * 60 * 1000` |

Schedule-change notifications intentionally use the longer TTL so buyers can open tickets after a date/venue update. Short checkout tokens are only for the immediate pay/confirm window. Support: if a checkout link expired, resend tickets or use forgotten-ticket (30d).

## 7. Compliance stubs (not live integrations)

* **TSE / Fiskaly:** Modes `planned` / `fiskaly` record stubs — **keine echte TSE-Signatur**, `compliance` never true until certified signing works. Env placeholders: `FISKALY_API_KEY`, `FISKALY_API_SECRET`, `FISKALY_TSS_ID`, `FISKALY_CLIENT_ID`. See `tse-plan.md`.
* **Lexware / Lexoffice:** Stub by default (`getAccountingProvider()`). Set `LEXWARE_ENABLED=1` + `LEXWARE_API_KEY` only when the HTTP client is ready — scaffold refuses fake success. Admin “Lexoffice markieren” on Stripe payouts remains manual.

## 8. Smoke after deploy

1. `GET /api/health` → `ok`, `db: up`, review `warnings` (SMTP, embed allowlist, rateLimit memory).
2. Playwright public smoke (no Stripe keys):  
   `BASE_URL=https://ticketfeeling-web.vercel.app npm run test:e2e`  
   (or local: start app, then `npm run test:e2e` from repo root / `apps/web`)
3. Deeper local commerce smoke (needs seed + `PAYMENT_PROVIDER=dev`):  
   `cd apps/web && BASE_URL=http://localhost:3000 npm run test:e2e:smoke-full`
4. Test checkout with live Stripe (small amount) → tickets + mail.
5. Cron: expire-holds / payouts with `Authorization: Bearer $CRON_SECRET` (Vercel Pro for cron reliability).
6. Embed on allowlisted parent (if restricted).
7. Scanner check-in on a real ticket QR.
