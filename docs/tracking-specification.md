# Tracking-Spezifikation

**Status:** Entwurf

## 1. Konfigurationsebenen

```text
System defaults → Organization → Event override
```

SCHLAGERfeeling-Annahme: gemeinsame GA4 + Meta Pixel; Eventparameter unterscheiden Events.

## 2. Integrationen (vorbereitet)

* Google Analytics 4
* Google Tag Manager
* Google Ads
* Meta Pixel
* Meta Conversions API
* optional TikTok Pixel, Microsoft Ads

## 3. Consent

Kategorien: `necessary`, `statistics`, `marketing`, `external_media`.

Tracking-Skripte und CAPI nur nach Consent. YouTube: Zwei-Klick / external_media.

## 4. Funnel Events

`event_page_view`, `artist_view`, `ticket_shop_view`, `ticket_category_view`, `seat_map_opened`, `seat_selected`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `customer_data_completed`, `add_payment_info`, `purchase_button_clicked`, `payment_started`, `payment_failed`, `payment_abandoned`, `payment_succeeded`, `purchase`, `tickets_issued`, `purchase_email_sent`, `refund`

## 5. Purchase-Regel

`purchase` erst wenn:

1. Provider serverseitig Erfolg meldet
2. Payment intern `paid`
3. eindeutige Transaction-ID vorhanden
4. Dedup-Key gespeichert (Browser + CAPI teilen dieselbe event_id)

## 6. Verbote

* Keine Namen, E-Mails, Adressen, Geburtsdaten als freie GA4-Parameter
* GA4 ist nicht Source of Truth für Umsatz
* Gender nicht ungeprüft an externe Tracker

## 7. Interne Speicherung

Sessions, anonymous visitor id, customer id (nach Login), UTM, gclid/fbclid, first touch, last non-direct, consent snapshot, device — in eigener DB.
