# ADR-001: Modularer Monolith mit Next.js

**Status:** Accepted (Annahme)  
**Datum:** 2026-07-31

## Kontext

Ticketfeeling braucht Shop, Admin, Kasse, Scanner und APIs. Team startet greenfield; frühe Microservice-Zerlegung erhöht Komplexität ohne klaren Nutzen.

## Entscheidung

Ein Next.js-Modular-Monolith (`apps/web`) mit Domain-Modulen unter `modules/`, Prisma in `packages/database`, separatem Worker-Prozess für BullMQ.

## Konsequenzen

* Schneller Start, gemeinsame Types, eine Deployment-Einheit (+ Worker)
* Klare Modulgrenzen ermöglichen spätere Extraktion
* Disziplin nötig, damit Domänen nicht vermischen (Payments ≠ Invoicing ≠ Lexware adapter)
