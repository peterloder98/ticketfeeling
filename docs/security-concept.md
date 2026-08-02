# Sicherheitskonzept

**Status:** Entwurf  
**Stand:** 2026-07-31

## 1. Schutzziele

* Vertraulichkeit personenbezogener und zahlungsbezogener Daten
* Integrität von Preisen, Kontingenten, Tickets, Rechnungen
* Verfügbarkeit bei Verkaufsstarts
* Nachweisbarkeit (Audit, Webhooks, Check-ins)
* Datenschutz (DSGVO): Minimierung, Consent, Export/Löschung mit Belegtrennung

## 2. Authentifizierung

* Auth.js: Passwort (Argon2id/bcrypt), Magic Link, E-Mail-Verifizierung, Reset
* Sichere Session-Cookies (`HttpOnly`, `Secure`, `SameSite`)
* Rate Limits / Lockout gegen Brute Force
* 2FA für Admins vorbereitet (TOTP), Enforcement später schaltbar
* Scanner-/Kassen-Sessions mit kürzerer Idle-Timeout-Policy

## 3. Autorisierung

* RBAC serverseitig, org- und event-scoped
* Keine Security nur durch Hidden UI
* Privilege separation: Bank, Tracking Secrets, Refunds

## 4. Zahlungen & Webhooks

* Signaturvalidierung fail-closed
* Raw body für HMAC
* Idempotente Inbox
* Replay-Schutz (event id + timestamp tolerance)
* Keine Kartendaten in TF
* Direct charges / connected account des Veranstalters

## 5. Tickets & QR

* High-entropy tokens, gehashed at rest
* Keine fortlaufende ID als QR-Inhalt
* Server validation inkl. Event/Status/Presence
* Token rotation bei Transfer/Replace
* PDF-Downloads über signed URLs, nicht öffentlich erratbar

## 6. Ticket vergessen & Chatbot

* Anti-enumeration responses
* Captcha + rate limits (IP, email hash)
* Sensitive order data nur nach Magic-Link/Login
* Bot darf keine mutierenden Finanz-/Ticketaktionen ausführen
* Prompt/RAG: nur freigegebene Knowledge Articles; Output-Filter für Secrets

## 7. Daten & Secrets

* Secrets nur in Env/Secret Manager
* Bankdaten/API-Tokens app-level encrypted (AES-GCM), Key via KMS/env
* PII minimization toggles je Org/Event
* Backups encrypted; restore tests geplant
* Audit logs nicht durch normale Admins löschbar

## 8. Web-Sicherheit

* HTTPS only, HSTS
* CSRF protection for cookie sessions
* XSS hardening (CSP), sanitized rich text
* SQL injection prevention via Prisma parameterized queries
* Embed origin whitelist + postMessage origin checks
* Upload malware/type checks; virus scanning later if needed

## 9. Datenschutz

* Consent categories & versions stored
* Retention policies: accounting docs vs profile data
* Account deletion does not erase mandatory fiscal records; anonymize where legally required
* Verarbeitungsverzeichnis vorbereiten
* Auftragsverarbeiter dokumentierbar

## 10. Monitoring

* Central error tracking (e.g. Sentry)
* Payment/webhook failure alerts
* Seat hold / inventory anomaly alerts
* Abuse alerts on forgotten-ticket & login endpoints
