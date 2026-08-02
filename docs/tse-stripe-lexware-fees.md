# TSE, Stripe, Lexware & Gebühren

**Stand:** 2026-07-31  
Betrifft: Peter Loder – Ticketfeeling

## 1. Was ist die TSE-Prüfung?

**TSE** = Technische Sicherheitseinrichtung (Kassensicherungsverordnung / § 146a AO).

Wenn Ticketfeeling **vor Ort** als elektronische Kasse für Bar- oder Kartenzahlungen genutzt wird (Tages-/Abendkasse), kann das System unter die KassenSichV fallen. Dann braucht man u. a.:

* zertifizierte TSE
* manipulationssichere Aufzeichnung jedes Geschäftsvorfalls
* Belegausgabe
* ggf. Meldung des Kassensystems an das Finanzamt
* dokumentierten Tagesabschluss

**Online-Ticketverkauf über Stripe/PayPal ist etwas anderes** — das ist kein klassisches Ladenkassen-TSE-Thema.

**Empfehlung:** Tageskasse in Ticketfeeling vorerst nur als interne Erfassung oder an ein bestehendes TSE-Kassensystem / Terminal anbinden. Erst nach Freigabe durch Steuerberater als eigene Kasse betreiben.

### Kennzeichnung in der App

* Kanal `box_office` → Anzeige **Tageskasse** (vor Ort, nicht Online-Selbstkauf)
* Belegnummern: `TF-K-…` (Kasse) vs. `TF-B-…` (Online)
* Liste: `/kasse/verkaeufe` · Beleg: `/kasse/beleg/{id}` · Filter: `/admin/orders?channel=box_office`

---

## 2. Was wird von Stripe konkret benötigt?

Für die Anbindung auf **dein Händlerkonto** (Peter Loder), nicht auf ein Plattform-Sammelkonto:

### Konten & Zugang

1. **Stripe-Account** (Geschäftskonto / Individual) auf Peter Loder
2. Identitäts- und Bankverifizierung abgeschlossen
3. Auszahlung auf dein Geschäftskonto aktiv

### API-Zugangsdaten (in Secrets, nie ins Repo)

| Variable | Zweck |
|---|---|
| `STRIPE_SECRET_KEY` | Server-API (sk_live_… / sk_test_…) |
| `STRIPE_PUBLISHABLE_KEY` | Checkout/Elements im Browser (pk_…) |
| `STRIPE_WEBHOOK_SECRET` | Signaturprüfung der Webhooks (whsec_…) |

### Webhook-Events (mindestens)

* `payment_intent.succeeded`
* `payment_intent.payment_failed`
* `charge.refunded` / `refund.updated`
* `charge.dispute.created` (optional früh)
* später: `payout.paid` für Auszahlungsabgleich

Webhook-URL (Beispiel):  
`https://www.ticketfeeling.de/api/v1/payments/webhooks/stripe`

### Produktentscheidung

* **Direct Charges** auf deinem Account (passt zum Start mit eigenen Events)
* Testmodus zuerst (`sk_test` / `pk_test`), dann Live

Optional später: PayPal Business mit Client-ID, Secret, Webhook-ID — gleiches Prinzip (Geld direkt zu dir).

---

## 3. Steuern

* **Standard Ticketsteuer: 7 %** (konfigurierbar, nicht hardcodiert)
* Andere Sätze nur, wenn du sie bewusst an Kategorie/Produkt setzt (0 / 19 / …)
* Vorverkaufsgebühr hat einen **eigenen konfigurierbaren Steuersatz** (Default ebenfalls 7 %, änderbar falls steuerlich anders gewünscht)

---

## 4. Stripe-/PayPal-Transaktionsgebühren vs. Kundenpreis

Beispiel:

* Kunde zahlt brutto **100,00 €**
* Stripe-Gebühr z. B. **2,50 €**
* Aufs Konto kommen ca. **97,50 €**

Das ist **kein** geringerer Umsatz beim Kunden, sondern deine **Zahlungsdienstleister-Kosten**.

### Richtige Trennung in Ticketfeeling

| Begriff | Bedeutung |
|---|---|
| `grossCents` Bestellung | Was der Kunde zahlt |
| `providerFeeCents` Zahlung | Was Stripe/PayPal einbehält |
| Netto-Auszahlung | gross − Gebühren − Erstattungen (pro Payout aggregiert) |

### Lexware-Buchungslogik (Empfehlung)

1. Ticketfeeling bleibt **operative Wahrheit** (Bestellung, Rechnung, Ticket).
2. Pro bezahlter Bestellung: Rechnung/Erlös in Lexware (Brutto/Netto/USt wie in TF).
3. Stripe-Gebühren **separat** als Aufwand / Gebührenkonto (nicht den Ticketpreis „kürzen“).
4. Bankeingang der Stripe-Auszahlung gegen offene Posten + Gebühren abstimmen.
5. Differenzen → Status `needs_review`.

Nie: „Bankauszahlung = Umsatz“.

---

## 5. Vorverkaufsgebühren (an den Kunden)

Konfigurierbar (Organisation, optional Event-Override):

* **Modus:** keine / Festbetrag pro Ticket / Prozent vom Ticketpreis
* **Standard:** 0 € (keine Gebühr)
* Wird im Checkout **vor** „Zahlungspflichtig bestellen“ transparent ausgewiesen
* Als eigene Position auf Bestellung/Rechnung (eigener Steuersatz)

Stripe-Gebühren sind davon **unabhängig** (Kosten von dir, außer du wälzt sie bewusst über Vorverkaufsgebühr um).
