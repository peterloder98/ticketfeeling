# Repository-Analyse

**Datum:** 2026-07-31  
**Status:** Greenfield

## Befund

Das Repository `ticketfeeling` enthält derzeit ausschließlich eine Git-Initialisierung. Es gibt:

* keinen Anwendungscode
* keine `package.json`, kein Framework-Scaffold
* keine Datenbankschemas oder Migrationen
* keine CI/CD-Konfiguration
* keine bestehende Dokumentation

## Konsequenz

Es liegt kein vorgegebener Technologie-Stack vor. Die Architektur folgt daher dem empfohlenen Stack aus dem Master-Prompt, mit ausdrücklich gekennzeichneten Annahmen.

## Annahmen (technisch)

| Annahme | Begründung |
|---|---|
| Next.js 15 (App Router) + TypeScript strict | Serverseitige Validierung, SSR/ISR, eine Codebasis für Shop + Admin |
| PostgreSQL 16 + Prisma | Relationale Integrität, Constraints, Transaktionen für Sitzplatzreservierungen |
| Auth.js (Auth.js v5 / NextAuth) | Etablierte Session-/Credential-Auth mit Magic Link |
| BullMQ + Redis | Zuverlässige Hintergrundjobs für PDF, E-Mail, Webhooks, Sync |
| S3-kompatibler Objektspeicher (z. B. Cloudflare R2 oder AWS S3) | Dauerhafte Dateien außerhalb des App-Servers |
| Stripe Connect / Stripe Direct Charge (Direct) | Kundengelder direkt auf Veranstalter-Händlerkonto |
| Resend oder Postmark | Transaktionale E-Mails mit Zustellstatus |
| Playwright + Vitest | E2E + Unit/Integration |
| shadcn/ui + Radix + Tailwind | Barrierearme Komponentenbasis ohne Vendor-Lock |

## Nicht vorhanden / muss aufgebaut werden

1. Monorepo- oder App-Struktur
2. Designsystem
3. Auth, RBAC, Audit-Log
4. Mandantenfähiges Datenmodell
5. Deployment-Pipeline
6. Secrets-/Umgebungskonzept

## Empfehlung

Phase 0 startet mit Scaffold, Kernschema, Auth, Organisation, RBAC, Audit-Log und CI. Kein produktiver Verkaufscode vor Abschluss der Dokumentationsprüfung.
