# TSE & Tageskasse — Plan

**Stand:** 2026-07-31  
**Status:** verbindliche Architektur; zertifizierte Signatur folgt mit Provider-Credentials

## 1. Wann TSE?

| Verkaufsweg | TSE in Ticketfeeling? |
|---|---|
| Online (Stripe/PayPal) | Nein — kein Ladenkassen-Vorgang |
| Tageskasse Bar | Ja, sobald TF als elektronische Kasse genutzt wird |
| Tageskasse Kartenterminal (über TF erfasst) | Ja, wenn Beleg/Geschäftsvorfall in TF entsteht |
| Externe TSE-Kasse + TF nur Ticketdruck | Mode `external` — Signatur außerhalb |

Steuerberater-Freigabe bleibt Voraussetzung vor produktivem Bar-Einsatz.

## 2. Modi (`OrganizationSettings.tseMode`)

| Mode | Bedeutung |
|---|---|
| `none` | Keine Signatur (Default bis Freigabe) |
| `planned` | Verkäufe werden fiscal erfasst (`FiscalTransaction`), aber **keine** rechtsgültige Signatur |
| `fiskaly` | Cloud-TSE über Fiskaly (DSFinV-K / TSE) — Zielprodukt |
| `external` | Externe Kasse; TF speichert nur Referenz |

## 3. Datenmodell

* `FiscalTransaction` — Signatur, QR, Counter, Rohdaten pro Kassenverkauf
* `BoxOfficeSession` — Schicht öffnen/schließen, Anfangs-/Endbestand Bar
* Beleg `/kasse/beleg/{id}` zeigt TSE-Status / QR wenn vorhanden

## 4. Fiskaly-Anbindung (nächster Technik-Schritt)

Modul-Interface: `TseSigner` / `resolveTseSigner()` in `apps/web/src/lib/fiscal/tse.ts`.  
`fiskalyTseSigner` bleibt Scaffold — **keine erfundenen Signaturen**, `status` bleibt `recorded`, `raw.compliance` bleibt `false`, bis der zertifizierte HTTP-Client live ist.

Env-Platzhalter (siehe `.env.example`):

* `FISKALY_API_KEY` / `FISKALY_API_SECRET`
* `FISKALY_TSS_ID` / `FISKALY_CLIENT_ID` (oder org-seitig in Stammdaten / `tseConfigEnc`)
* optional `FISKALY_API_URL`

Ablauf pro Barverkauf (Ziel):

1. Order + Payment anlegen  
2. `signBoxOfficeSale` → Fiskaly Transaction  
3. `FiscalTransaction` speichern  
4. Beleg mit TSE-QR ausgeben  
5. Tagesabschluss → DSFinV-K Export (später)

## 5. Betriebsregel Bar

* Ohne `tseMode` ∈ {fiskaly, external} und ohne Steuerfreigabe: UI warnt weiterhin.
* Mit `planned`: Verkauf erlaubt zur Erprobung, Beleg kennzeichnet „keine TSE-Signatur“.
* Mit `fiskaly` ohne Credentials: Verkauf wird recorded, Status nicht `signed`.

## 6. Nicht-Ziele (jetzt)

* Eigene Hardware-TSE bauen
* Online-Stripe mit TSE vermischen
* Fiskaly-Live ohne deine API-Zugangsdaten

Passwort/SMTP und TSE-Secrets werden **nur in der Admin-UI** hinterlegt (AES-GCM).
