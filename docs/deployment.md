# Deployment

**Status:** Entwurf

## 1. Zielumgebungen

| Env | Zweck |
|---|---|
| local | Docker Compose: Postgres, Redis, Mailpit, MinIO |
| staging | Produktionsnah, Test-Payment-Keys |
| production | ticketfeeling.de |

## 2. Laufzeit-Annahme

* App: Next.js auf Container-Platform (Fly.io / Railway / AWS ECS / Vercel + separate Worker)
* Worker: eigener Prozess für BullMQ
* Postgres managed
* Redis managed
* S3-kompatibler Storage
* CDN für Public Assets

**Offen:** Hosting-Provider final (siehe `open-decisions.md`).

## 3. CI/CD

* Lint, typecheck, unit/integration, e2e smoke
* Prisma migrate deploy
* Preview deploys for PRs (staging-like)
* Secrets via platform secret store
* Keine Secrets im Repo

## 4. Observability

* Health: `/api/health` (db, redis, queue depth)
* Error tracking, structured logs, metrics
* Alerts: webhook failures, job DLQ, payment anomalies

## 5. Backup & Restore

* Daily DB backups + PITR wenn verfügbar
* Object storage versioning
* Quartalsweise Restore-Tests dokumentieren

## 6. Domain & TLS

* www.ticketfeeling.de
* optional tickets.schlagerfeeling.de → rewrite/proxy zum Shop
* TLS überall
