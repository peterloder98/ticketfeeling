# Product Requirements — Ticketfeeling

**Produkt:** Ticketfeeling  
**Domain:** https://www.ticketfeeling.de  
**Erstkunde / Erstveranstalter:** SCHLAGERfeeling  
**Dokumentstatus:** Entwurf zur Prüfung  
**Stand:** 2026-07-31

## 1. Produktziel

Ticketfeeling ist eine produktionsfähige Ticketing- und Eventmanagement-Plattform. Sie deckt den gesamten Lebenszyklus ab: Stammdaten, Verkauf, Zahlung, Ticketausgabe, Einlass, Buchhaltung, Berichte, Tracking und Kundenkommunikation.

Erste Nutzung durch SCHLAGERfeeling (eigene Events). Das Datenmodell ist von Tag 1 mandantenfähig (`organization_id`).

## 2. Kernprinzipien

1. **Zahlungsintegrität vor UX-Geschwindigkeit** — Kauf gilt erst nach serverseitig bestätigter Zahlung.
2. **Direkter Geldfluss** — Kundengelder gehen auf das Händlerkonto des Veranstalters, nicht auf ein Plattform-Sammelkonto.
3. **Server-side truth** — Preise, Rabatte, Steuern, Kapazitäten, Reservierungen und Berechtigungen nur serverseitig.
4. **Revisionsfähigkeit** — sensible Änderungen auditierbar; Rechnungen unveränderlich; Snapshots bei Bestellung.
5. **Datenschutz by design** — Consent, Datenminimierung, getrennte Aufbewahrung von Profil- und Belegdaten.
6. **Keine Mock-als-fertig** — unfertige Funktionen klar als Stub/Placeholder kennzeichnen.

## 3. Zielgruppen

| Persona | Bedarf |
|---|---|
| Endkunde | Tickets kaufen, Konto, Downloads, Übertragung, Support (Chatbot / Ticket vergessen) |
| Veranstalter-Admin | Stammdaten, Events, Preise, Benutzer, Integrationen |
| Eventmanager | Events, Künstler, Locations, Saalpläne, Kontingente |
| Buchhaltung | Rechnungen, Erstattungen, Lexware, Exporte |
| Marketing | Inhalte, Rabatte, Tracking, Berichte |
| Kundenservice | Bestellungen, Resend, Umbuchungen, Support |
| Tageskasse | Touch-Verkauf, Bar/Karte, Abschluss |
| Einlassleitung / Scanner | Check-in/out, Live-Statistik |

## 4. Funktionsumfang (Produktbereiche)

### 4.1 Veranstalter & Mandanten

* Organisationsstammdaten, Branding, Bankdaten (verschlüsselt), Rechtstexte mit Versionierung
* Mehrere Organisationen vorbereitet; Start mit einer Organisation (SCHLAGERfeeling)

### 4.2 Stammdaten

* Künstler (inkl. Medien, Rechte, Videos, öffentliche Seiten `/kuenstler/{slug}`)
* Locations, Räume, Anreise
* Events inkl. Status-/Zeitmodell, Änderungen, Kundenkommunikation
* Touren und Tourpakete (1 Bestellung → n Event-Tickets mit eigenen QR-Codes)

### 4.3 Verkauf

* Ticketkategorien, Kontingente (kanalspezifisch), Warenkorb, Seat Holds
* Checkout mit Pflichtkundenkonto, Rechtstext-Zustimmung, „Zahlungspflichtig bestellen“
* Zahlungen (Stripe Direct / PayPal Business / Kasse)
* PDF-Tickets, QR-Tokens, Kundenkonto-Downloads

### 4.4 Rabatte & Gutscheine

* Regelbasierte Rabatt-Engine, Codes, Wertgutscheine mit Ledger
* Alle Berechnungen serverseitig; Snapshots an Order Items

### 4.5 Operations

* Tages-/Abendkasse, Kassenabschluss
* Scanner-PWA (Check-in/out, Farblogik, Protokoll)
* Saalplan-Editor mit Versionierung und Verkaufssperre

### 4.6 Finanzen

* Rechnungen / Korrekturbelege, Nummernkreise
* Lexware Office über `AccountingProvider`-Schnittstelle
* Interne Verkaufsstatistiken als Source of Truth

### 4.7 Kommunikation & Support

* Transaktionale E-Mails, automatische Tages-/Wochen-/Monatsberichte
* **Kunden-Chatbot** (siehe Abschnitt 5)
* **Ticket vergessen / Ticket erneut senden** (siehe Abschnitt 6)

### 4.8 Tracking & Consent

* GA4 / GTM / Meta / optional weitere, Consent-gesteuert
* Interne Attribution; Purchase erst nach Payment-Confirm + Dedup

## 5. Kunden-Chatbot (von Anfang an)

### 5.1 Ziel

Kunden erhalten schnelle, korrekte Antworten zu Abläufen, Events, Tickets und Support-Themen — ohne dass der Bot Zahlungen, Stornos oder Ticketstatus eigenmächtig verändert.

### 5.2 Einsatzorte

* Öffentliche Eventseiten
* Checkout-Hilfe (nicht-blockierend)
* Kundenkonto
* Dedizierte Hilfe-Seite `/hilfe`
* Optional eingebetteter Widget-Modus auf Veranstalterseiten

### 5.3 Fähigkeiten (MVP Phase 1/2)

* FAQ zu Kaufablauf, Zahlung, Einlass, Umbuchung, Erstattung (regelbasiert + kuratierte Wissensbasis)
* Event-bezogene Antworten (Datum, Location, Einlasszeiten, Vorverkaufsstart) aus freigegebenen öffentlichen Daten
* Weiterleitung an „Ticket vergessen“
* Eskalation an Kundenservice (Ticket/Anfrage erzeugen)
* Mehrsprachig vorbereitet (Start: DE)

### 5.4 Harte Grenzen

* Keine Preisberechnung, keine Reservierung, kein Storno, keine Ticketänderung durch den Bot
* Keine Ausgabe sensibler Daten (volle Ticketnummer, Adresse, Zahlungsdaten) ohne starke Authentifizierung
* Antworten zu Bestellungen/Tickets nur nach Login oder verifiziertem Magic-Link-Zugriff
* Alle Bot-Aktionen (außer reiner FAQ) erzeugen Audit-/Support-Events
* LLM-Nutzung nur mit Retrieval über freigegebene Inhalte; Halluzinationen durch Source-Grounding begrenzen

### 5.5 Architekturannahme

Hybrid:

1. **Intent-Router** (regelbasiert) für kritische Flows (Ticket vergessen, Bestellung finden, Support)
2. **RAG über kuratierte Wissensbasis** (FAQ, Event-Public-Facts, Rechtstext-Zusammenfassungen) für allgemeine Fragen
3. **Human Handoff** in Support-Queue

Annahme: Zunächst Provider-agnostisch über `SupportChatProvider`; konkrete LLM-Wahl offen (siehe `open-decisions.md`).

## 6. Ticket vergessen

### 6.1 Ziel

Kunden, die Tickets nicht finden (E-Mail verloren, anderes Gerät, Spam), sollen sicher erneut Zugriff erhalten — ohne Support-Engpass und ohne Ticket-Missbrauch.

### 6.2 Self-Service-Flow

1. Nutzer öffnet `/hilfe/ticket-vergessen` oder startet Intent im Chatbot.
2. Eingabe: E-Mail-Adresse (+ optional Bestellnummer / Event).
3. Rate-Limit + Captcha/Bot-Schutz.
4. System prüft serverseitig, ob passende bezahlte Bestellungen existieren.
5. Unabhängig vom Ergebnis: generische Erfolgsmeldung („Falls vorhanden, senden wir einen Link“).
6. Bei Treffer: Magic-Link / zeitlich begrenzter Secure-Download-Link an die Bestell-E-Mail.
7. Nach Verifikation: Tickets + Rechnung erneut anzeigen/downloaden; optional Resend der Ticket-Mail.
8. Jeder Versuch und Versand wird protokolliert.

### 6.3 Authentifizierter Flow (Kundenkonto)

* Eingeloggter Kunde: Bestellung wählen → „Tickets erneut senden“ / Download.
* Kundenservice-Rolle darf Resend auslösen (mit Audit).

### 6.4 Sicherheitsregeln

* Keine Enumeration (kein Hinweis „E-Mail unbekannt“)
* Keine Klartext-QR in E-Mail-Preview ohne Auth
* Downloadlinks signiert, kurzlebig, einzweck- oder sessiongebunden
* Resend-Rate-Limits pro E-Mail / Bestellung / IP
* Bei übertragenen Tickets: aktueller Holder erhält Zugang; Käufer sieht Übertragungsstatus

## 7. Nicht-Ziele (erste produktive Version)

* Offizieller Wiederverkaufsmarktplatz
* Vollständiges Wallet (Apple/Google) — vorbereitet, später
* Multi-Veranstalter-Marktplatz mit Plattformgebühren
* Offline-Scanner als Primärpfad (nur Konzept + Konfliktregeln)

## 8. Akzeptanzkriterien erste produktive Version

Siehe Master-Prompt Abschnitt 45 sowie Roadmap. Ergänzend:

31. Chatbot beantwortet kuratierte FAQ und Event-Basics korrekt.
32. „Ticket vergessen“ liefert sicheren Resend-/Download-Pfad ohne Enumeration.
33. Bot kann keine Tickets entwerten, erstatten oder Plätze ändern.

## 9. Beispiel-Events (Erstbetrieb)

* SCHLAGERfeeling Open Air
* Schlagernacht der Herzen
* SCHLAGERfeeling Weihnachtstraum
