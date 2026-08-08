# Tracking-Spezifikation

**Status:** Aktiv (Meta P0 + interne Foundation)

## 1. Konfigurationsebenen

```text
System defaults (Env) → Organization → Event override
```

SCHLAGERfeeling-Annahme: gemeinsame GA4 + Meta Pixel; Eventparameter unterscheiden Events.

Env (optional):

* `META_CAPI_ACCESS_TOKEN` / `META_ACCESS_TOKEN`
* `META_PIXEL_ID` (Fallback wenn Org-Pixel fehlt)
* `META_TEST_EVENT_CODE` (Events Manager Test)
* `GA4_API_SECRET` / `GA4_MEASUREMENT_PROTOCOL_API_SECRET`
* `EMBED_FRAME_ANCESTORS` (postMessage Allowlist)
* `NEXT_PUBLIC_EMBED_FRAME_ANCESTORS` (Client-Bridge Allowlist)
* `TRACKING_LINKER_DOMAINS`

## 2. Integrationen

* **Meta Pixel** (Browser, Consent `marketing`)
* **Meta Conversions API** (Server, gleicher `event_id`)
* Google Analytics 4 + Measurement Protocol (sekundär)
* Google Tag Manager / Google Ads (bestehend)

## 3. Consent

Kategorien: `necessary`, `statistics`, `marketing`, `external_media`.

* Interne Funnel-Logs: immer (ohne unnötige PII)
* Pixel / CAPI / GA4: nur nach Consent
* Embed: `Ticketfeeling.setConsent({ statistics, marketing })` + `tf:consent` postMessage

## 4. Meta Funnel (Primärziel)

| TF Event | Meta Pixel/CAPI | Wann |
|---|---|---|
| `event_page_view` / `ticket_shop_view` | ViewContent | Event-/Shop-Seite |
| `add_to_cart` | AddToCart | Warenkorb-Add |
| `begin_checkout` | InitiateCheckout | Checkout-Mount |
| `add_payment_info` | AddPaymentInfo | Zahlungsart gewählt |
| `purchase` | Purchase | **Server** nach Zahlung + optional Pixel-Mirror |

Jeder Meta-Hit: `event_name`, `event_time`, `event_id`, `event_source_url`, `action_source=website`, `content_ids`/`content_name`/`content_type=product`, `value`, `currency`, `num_items`, `_fbp`/`_fbc` (Parent-Cookies über Embed-Bridge).

**Purchase-Regel:** Authoritative CAPI beim Fulfillment (`order.post_fulfill`). Thank-you-Page darf Pixel mit **derselben** `event_id` (`= orderId`) feuern — Dedup über `event_id` + Delivery-Log.

## 5. Embed / iframe (schlagerfeeling.de u. a.)

Offizielle Loader: `/embed/ticketfeeling.js` (nicht nur blankes iframe).

Parent → iframe:

* `tf:attribution` — parent URL, referrer, UTMs, fbclid/gclid, **`_fbp`/`_fbc`**, Consent
* `tf:consent`

iframe → Parent:

* `tf:tracking-ready`, `tf:embed-height`, `tf:track` (Parent feuert First-Party Pixel)

Origins: Allowlist `EMBED_FRAME_ANCESTORS` / Referrer-Fallback.

## 6. Interne Speicherung

`tracking_sessions`, `tracking_events`, `tracking_deliveries` (pending|sent|failed|retry).

Funnel-Stufen für Audit / Custom Audiences: Landing → Ticketshop View → AddToCart → InitiateCheckout → Payment → Purchase.

## 7. Verbote

* Keine Klartext-E-Mails/Namen als freie GA4-Parameter
* GA4/Meta sind nicht Source of Truth für Umsatz (interne DB)
* Gender nicht ungeprüft an externe Tracker

## 8. Manuelle Checkliste (Meta)

A. Direct: Eventseite → ViewContent in Events Manager  
B. Direct: AddToCart  
C. Direct: InitiateCheckout + AddPaymentInfo  
D. Direct: Kauf → Server Purchase CAPI + Pixel Mirror gleiche event_id  
E. iframe schlagerfeeling: Loader + UTMs/fbclid in Session  
F. iframe: Parent `_fbp`/`_fbc` erreichen CAPI user_data  
G. iframe: Parent Pixel empfängt `tf:track`  
H. Consent nur nötig → kein Pixel/CAPI Funnel (Purchase Server-Ops-Log bleibt)  
I. Doppel-Purchase (Refresh Thank-you + Webhook) → eine Delivery `sent`  
J. Dedup event_id Pixel ↔ CAPI  
K. Test Event Code in Events Manager  
L. Allowlist Origin: fremde Origin postMessage abgelehnt  
M. Adblock: interne Events trotzdem in Admin-Debug  
N. GA4 send_page_view im Embed aus (kein Double-PV)  
O. Self-Referral: Parent-URL als event_source_url  
P. Multi-Event content_ids  
Q. Admin Debug: Funnel-Häkchen je Stufe/Kanal  
