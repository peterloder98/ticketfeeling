# Buchhaltungskonzept

**Status:** Entwurf  
**Hinweis:** Steuerlogik und Vorlagen vor Produktivbetrieb durch Steuerberatung prüfen.

## 1. Objekttrennung

Niemals vermischen:

```text
Order ≠ Payment ≠ Invoice/Beleg ≠ Ticket ≠ Refund ≠ Credit Note
```

Primary source of truth: Ticketfeeling-DB. Lexware Office = angebundenes Buchhaltungssystem.

## 2. Rechnungen

* Fortlaufende Nummernkreise je Organisation (Beispiel `TF-2027-000001`)
* Finalisierte Rechnungen unveränderlich
* Korrekturen nur über Storno-/Korrekturbeleg mit Bezug
* Snapshots: Verkäufer, Kunde, Positionen, Steuern

## 3. Steuern

* Steuersätze konfigurierbar (mindestens 0 %, 7 %, 19 %)
* **Kein hardcodiertes 7 %** im Code; Default-Vorlage für Ticketprodukte = 7 %
* Add-ons eigene Tax Rates
* Tourpakete steuerlich auf Positionen aufteilbar
* Speicherung: `tax_rate_bps`, net/tax/gross cents

## 4. Geldfluss

* Kundengeld → Veranstalter-Händlerkonto (Stripe Direct / PayPal Business)
* TF speichert Fees vom Provider für Auswertung, ist aber nicht Zahlungsempfänger
* Tageskasse: separate cash sessions / closings

## 5. Lexware Office Integration

**Stand:** Stub by default via `getAccountingProvider()` (`lexwareStubProvider`).  
HTTP scaffold: `lexwareHttpProvider` — activated only with `LEXWARE_ENABLED=1` + `LEXWARE_API_KEY`; **refuses fake success** (throws) until the Lexoffice client is implemented.

Env (see `.env.example`): `LEXWARE_ENABLED`, `LEXWARE_API_KEY`, `LEXWARE_ORGANIZATION_ID`, `LEXWARE_API_URL`.

Fulfillment queues a snapshot + audit via the stub; Stripe payout UI can mark a payout as “in Lexoffice zugeordnet” manually.

Interface:

```text
AccountingProvider  (apps/web/src/lib/accounting/types.ts)
- connect()
- disconnect()
- createInvoice()
- createCorrection()
- markPaid()
- getSyncStatus()
- retrySync()
```

Sync states: `not_required | queued | syncing | synced | failed | needs_review`

**How to connect later:** implement Lexoffice REST in `lexware-http.ts`, set `LEXWARE_ENABLED=1` + API key on Vercel, redeploy. Until then keep `LEXWARE_ENABLED` unset/0.

Admin UI (manual): **Finanzen → Stripe → Lexoffice markieren** — not a live adapter.

## 6. Erstattungen

1. Permission
2. Refundable amount + tax split
3. Provider refund
4. Wait result/webhook
5. Void tickets
6. Correction document
7. Accounting sync
8. Customer mail
9. Audit

## 7. Berichte

Täglich / wöchentlich / monatlich aus interner DB (nicht GA4). Siehe `email-concept.md` und Roadmap Phase 7.
