import type { LegalDocumentType } from "@/lib/legal/document-types";
import {
  DEFAULT_LEGAL_PERSON_LINE,
  DEFAULT_PUBLIC_COMPANY_ADDRESS,
  formatCompanyAddressBlock,
} from "@/lib/legal/company-address";

export type LegalSeedDoc = {
  type: LegalDocumentType;
  version: string;
  title: string;
  changelog: string;
  content: string;
};

/** Public address only — never Konradinstr. / Altdorf in customer-facing legal texts. */
const SELLER = `${formatCompanyAddressBlock(DEFAULT_PUBLIC_COMPANY_ADDRESS, {
  legalPersonLine: DEFAULT_LEGAL_PERSON_LINE,
})}
E-Mail: support@ticketfeeling.de
Telefon: 01512 / 5744383`;

export const LEGAL_SEED_CATALOG: LegalSeedDoc[] = [
  {
    type: "impressum",
    version: "1.0.1",
    title: "Impressum",
    changelog: "Öffentliche Anschrift: Innere Münchener Str. 36, Landshut (Billing-Adresse nur intern)",
    content: `Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)

${SELLER}

Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: Peter Loder, Anschrift wie oben.

Marken- und Angebotsbezeichnung: Ticketfeeling.
Ticketshop-Domain: www.ticketfeeling.de (bzw. die jeweils von Ticketfeeling betriebene Shop-Domain).

Streitbeilegung: Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: https://ec.europa.eu/consumers/odr/
Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen, soweit keine gesetzliche Pflicht besteht.

Hinweis: Dieses Impressum gilt für die Ticketfeeling-Plattform. Soweit einzelne Veranstaltungen von anderen Veranstaltern angeboten werden, bleiben diese Vertragspartner der Ticketkäufer; dies wird im jeweiligen Angebot kenntlich gemacht.`,
  },
  {
    type: "terms",
    version: "1.0.0",
    title: "Allgemeine Geschäftsbedingungen (AGB)",
    changelog: "Erstveröffentlichung Ticketfeeling AGB",
    content: `Allgemeine Geschäftsbedingungen der Ticketfeeling-Plattform
Stand: August 2026

1. Geltungsbereich
1.1 Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der Ticketfeeling-Plattform und für den Kauf von Eintrittskarten (Tickets) über Ticketfeeling.
1.2 Abweichende Bedingungen des Kunden gelten nur, wenn Ticketfeeling ihnen ausdrücklich schriftlich zugestimmt hat.
1.3 Vertragssprache ist Deutsch. Es gilt deutsches Recht.

2. Begriffsdefinitionen
2.1 „Plattform“ bezeichnet die von Ticketfeeling betriebene technische Infrastruktur zum Anbieten und Verkaufen von Tickets.
2.2 „Veranstalter“ ist derjenige, der die jeweilige Veranstaltung durchführt und grundsätzlich Vertragspartner des Käufers für die Veranstaltungsleistung ist.
2.3 „Ticketfeeling“ / „wir“ bezeichnet Peter Loder, handelnd unter Ticketfeeling, als Betreiber der Plattform.
2.4 „Kunde“ / „Käufer“ ist jede natürliche oder juristische Person, die über die Plattform Tickets erwirbt.
2.5 „Ticket“ ist der digitale oder ausdruckbare Nachweis mit QR-Code zum Einlass.

3. Vertragspartner
3.1 Der Betreiber der Plattform ist:
${SELLER}
3.2 Vertragspartner des Käufers für die Veranstaltung ist grundsätzlich der jeweilige Veranstalter. Ticketfeeling stellt die technische Plattform bereit und kann – soweit vereinbart – die Zahlungsabwicklung durchführen.
3.3 Ob Ticketfeeling selbst oder ein anderer Veranstalter Vertragspartner ist, ergibt sich aus dem jeweiligen Angebot und den Bestellunterlagen.
3.4 Die Architektur der Plattform ist darauf ausgelegt, sowohl eigene Veranstaltungen als auch Veranstaltungen anderer Veranstalter abzubilden.

4. Vertragsschluss
4.1 Die Darstellung von Veranstaltungen und Tickets auf der Plattform ist unverbindlich und stellt noch kein verbindliches Angebot dar.
4.2 Mit Absenden der Bestellung gibt der Kunde ein verbindliches Angebot ab.
4.3 Der Vertrag kommt erst mit erfolgreicher Zahlung zustande. Nicht erfolgreich abgeschlossene Zahlungen führen zu keiner verbindlichen Reservierung und begründen keinen Anspruch auf ein Ticket.
4.4 Nach erfolgreicher Zahlung erhält der Kunde eine Bestätigung per E-Mail und die Tickets in der vereinbarten Form.

5. Kundenkonto
5.1 Für bestimmte Funktionen kann ein Kundenkonto erforderlich sein. Gastkäufe sind möglich, soweit angeboten.
5.2 Der Kunde ist verpflichtet, wahrheitsgemäße Angaben zu machen und Zugangsdaten geheim zu halten.
5.3 Ticketfeeling kann Konten bei Missbrauch, Sicherheitsrisiken oder Verstößen gegen diese AGB sperren.

6. Ticketkauf
6.1 Der Kunde wählt Kategorie, Menge und – soweit vorgesehen – Sitzplätze aus und legt die Tickets in den Warenkorb.
6.2 Verfügbarkeiten und Preise können sich bis zum Vertragsschluss ändern.
6.3 Pro Bestellung können Mengenbegrenzungen gelten.

7. Zahlungsabwicklung
7.1 Die Zahlung erfolgt zum Start der Plattform über den Zahlungsdienstleister Stripe. Weitere Zahlungsarten können später ergänzt werden.
7.2 Der Kunde wird zur Zahlung an den Zahlungsdienstleister weitergeleitet bzw. gibt die Zahlungsdaten im eingebetteten Zahlungsformular ein.
7.3 Ticketfeeling erhält vom Zahlungsdienstleister eine Rückmeldung über Erfolg oder Fehlschlag der Zahlung.

8. Preise und Gebühren
8.1 Ticketpreise werden inklusive der gesetzlichen Umsatzsteuer ausgewiesen, soweit Umsatzsteuer anfällt.
8.2 Zusätzlich kann eine Verwaltungsgebühr erhoben werden. Diese ist global einstellbar, prozentual und wird im System automatisch berücksichtigt.
8.3 Der im Checkout ausgewiesene Gesamtbetrag ist verbindlich für die jeweilige Bestellung.

9. Rechnungen
9.1 Privatkunden können auf Wunsch eine Rechnung per E-Mail erhalten.
9.2 Unternehmen erhalten bei Angabe vollständiger Unternehmensdaten eine Rechnung mit Rechnungsnummer, Datum, Leistungsbeschreibung, Umsatzsteuerausweis und Unternehmensangaben.
9.3 Rechnungen werden elektronisch übermittelt.

10. Digitale Tickets
10.1 Tickets können als PDF, Ausdruck, Anzeige auf dem Smartphone oder als Screenshot genutzt werden, sofern der QR-Code vollständig und gut lesbar ist.
10.2 Soweit technisch angeboten, können Tickets zusätzlich in Apple Wallet und Google Wallet hinterlegt werden. Bei Storno oder Ungültigkeit kann der Wallet-Pass aktualisiert bzw. deaktiviert werden.
10.3 Maßgeblich für den Einlass ist der gültige, nicht entwertete QR-Code.

11. Ticketübertragung
11.1 Tickets dürfen privat übertragen oder verschenkt werden.
11.2 Der ursprüngliche Käufer bleibt für die ordnungsgemäße Weitergabe verantwortlich.
11.3 Eine Übertragung ändert nichts an diesen AGB und den Veranstaltungsbedingungen.

12. Weiterverkaufsverbot
12.1 Der gewerbliche Weiterverkauf, der automatisierte Weiterverkauf, der Weiterverkauf mit Gewinnerzielungsabsicht sowie – soweit rechtlich zulässig – der Verkauf über Ticketbörsen sind untersagt.
12.2 Bei Verstößen kann der Einlass verweigert werden; ein Erstattungsanspruch besteht in diesen Fällen grundsätzlich nicht.

13. Einlassregelungen
13.1 Einlasszeiten werden je Veranstaltung festgelegt und auf der Veranstaltungsseite veröffentlicht.
13.2 Zum Einlass ist ein gültiges Ticket mit lesbarem QR-Code vorzuzeigen; ein amtlicher Lichtbildausweis kann verlangt werden.
13.3 Ob ein Wiedereintritt möglich ist, entscheidet der Veranstalter (z. B. erneuter Scan, Einlassband, Stempel).

14. Hausrecht
14.1 Der Veranstalter übt das Hausrecht aus.
14.2 Ein Ausschluss vom Einlass oder von der Veranstaltung ist insbesondere möglich bei Gewalt, aggressivem Verhalten, erheblicher Alkoholisierung, Drogenkonsum, Waffen, Pyrotechnik, diskriminierendem Verhalten oder massiven Störungen.
14.3 In diesen Fällen besteht grundsätzlich kein Erstattungsanspruch.

15. Programmänderungen
15.1 Programmänderungen sind zulässig, insbesondere Künstleränderungen, krankheitsbedingte Ausfälle, Änderungen der Reihenfolge, einzelner Programmpunkte sowie technische oder organisatorische Anpassungen, sofern der Gesamtcharakter der Veranstaltung nicht wesentlich verändert wird.
15.2 Ein Anspruch auf Rückgabe oder Minderung besteht hierdurch grundsätzlich nicht.
15.3 Bei Verhinderung von Künstlern wird – soweit möglich – ein gleichwertiger Ersatz angestrebt; hierauf besteht kein Anspruch.

16. Terminverlegung
16.1 Bei einer Terminverlegung behalten Tickets grundsätzlich ihre Gültigkeit für den neuen Termin.
16.2 Der Kunde wird per E-Mail informiert, soweit eine E-Mail-Adresse vorliegt.
16.3 Kulanzregelungen kann der Veranstalter freiwillig anbieten.

17. Veranstaltungsabsage
17.1 Bei vollständiger Absage wird der gezahlte Ticketpreis einschließlich erhobener Verwaltungsgebühren erstattet.
17.2 Die Rückzahlung erfolgt grundsätzlich automatisch auf das ursprünglich verwendete Zahlungsmittel. Ist dies technisch nicht möglich, wird der Käufer informiert und erhält eine alternative Auszahlungsmöglichkeit.
17.3 Ein gesonderter Antrag ist grundsätzlich nicht erforderlich.

18. Höhere Gewalt
18.1 Ticketfeeling und der Veranstalter haften nicht für Verzögerungen oder Unmöglichkeit, soweit diese auf höherer Gewalt beruhen.
18.2 Hierzu zählen insbesondere Naturkatastrophen, Unwetter, Pandemien, Terrorlagen, Krieg, Streiks, behördliche Anordnungen, Stromausfälle, Sicherheitslagen und sonstige unvorhersehbare, unabwendbare Ereignisse.
18.3 Rechte bei Absage oder Verlegung bleiben nach Maßgabe dieser AGB und der Rückerstattungshinweise unberührt.

19. Haftung
19.1 Ticketfeeling haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit.
19.2 Bei leichter Fahrlässigkeit haftet Ticketfeeling nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, typischerweise eintretenden Schaden.
19.3 Die Haftung für die Durchführung der Veranstaltung liegt – soweit Ticketfeeling nicht selbst Veranstalter ist – beim jeweiligen Veranstalter.

20. Datenschutz
20.1 Hinweise zur Verarbeitung personenbezogener Daten enthält die gesonderte Datenschutzerklärung.
20.2 Die Datenschutzerklärung ist nicht Bestandteil dieser AGB, gilt aber für die Nutzung der Plattform.

21. Verbraucherinformationen
21.1 Verbraucher haben die gesetzlichen Gewährleistungsrechte, soweit anwendbar.
21.2 Für Tickets zu Veranstaltungen mit festem Termin ist das Widerrufsrecht nach § 312g Abs. 2 Nr. 9 BGB ausgeschlossen; Einzelheiten enthält die Widerrufsbelehrung.

22. Streitbeilegung
22.1 Ticketfeeling nimmt grundsätzlich nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil, sofern keine gesetzliche Verpflichtung besteht.
22.2 Die EU-OS-Plattform ist unter https://ec.europa.eu/consumers/odr/ erreichbar.

23. Schlussbestimmungen
23.1 Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.
23.2 Gegenüber Verbrauchern gelten die gesetzlichen Gerichtsstände.
23.3 Gegenüber Kaufleuten, juristischen Personen des öffentlichen Rechts und öffentlich-rechtlichen Sondervermögen ist – soweit gesetzlich zulässig – Landshut Gerichtsstand.
23.4 Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
23.5 Foto-, Film- und Tonaufnahmen während Veranstaltungen sind möglich; Besucher können als Teil der Veranstaltung erkennbar sein. Die Nutzung erfolgt im Rahmen der gesetzlichen und datenschutzrechtlichen Vorgaben (Berichterstattung, Dokumentation, Werbung, Social Media, zukünftige Veranstaltungen).

Hinweis: Diese AGB sind ein eigenständiger Entwurf für Ticketfeeling und vor Produktivstart fachlich zu prüfen.`,
  },
  {
    type: "event_terms",
    version: "1.0.0",
    title: "Veranstaltungsbedingungen",
    changelog: "Erstveröffentlichung",
    content: `Veranstaltungsbedingungen – Ticketfeeling
Stand: August 2026

1. Geltung
Diese Veranstaltungsbedingungen gelten ergänzend zu den AGB für den Besuch der jeweiligen Veranstaltung.

2. Einlass
2.1 Einlasszeiten werden je Veranstaltung festgelegt und auf der Veranstaltungsseite veröffentlicht.
2.2 Zum Einlass ist ein gültiges Ticket mit vollständig lesbarem QR-Code vorzuzeigen.
2.3 Der Veranstalter kann einen amtlichen Lichtbildausweis verlangen.

3. QR-Code und Entwertung
3.1 Der QR-Code darf nur einmal erfolgreich eingelöst werden. Maßgeblich ist die erste erfolgreiche Entwertung.
3.2 Jede weitere Nutzung desselben Codes ist ungültig.
3.3 Manipulierte oder technisch veränderte Tickets/QR-Codes verlieren ihre Gültigkeit.

4. Wiedereintritt
Ob und wie ein Wiedereintritt möglich ist (erneuter Scan, Einlassband, Stempel o. Ä.), entscheidet der jeweilige Veranstalter und wird vor Ort bzw. auf der Eventseite kommuniziert.

5. Hausrecht und Sicherheit
5.1 Der Veranstalter übt das Hausrecht aus.
5.2 Ein Ausschluss ist insbesondere möglich bei Gewalt, aggressivem Verhalten, erheblicher Alkoholisierung, Drogen, Waffen, Pyrotechnik, Diskriminierung oder massiven Störungen. Ein Erstattungsanspruch besteht in diesen Fällen grundsätzlich nicht.
5.3 Sicherheitskontrollen und Taschenkontrollen können durchgeführt werden.

6. Programm und Künstler
Programmänderungen und Künstlerausfälle sind nach Maßgabe der AGB zulässig, sofern der Gesamtcharakter nicht wesentlich verändert wird.

7. Foto- und Videoaufnahmen
Während der Veranstaltung können Aufnahmen erstellt werden. Besucher können als Teil des Publikums erkennbar sein. Details enthält die Datenschutzerklärung.

Hinweis: Entwurf für Ticketfeeling – vor Produktivstart fachlich prüfen.`,
  },
  {
    type: "ticket_conditions",
    version: "1.0.0",
    title: "Ticketbedingungen",
    changelog: "Erstveröffentlichung",
    content: `Ticketbedingungen – Ticketfeeling
Stand: August 2026

1. Ticketformen
Zulässig sind PDF, Ausdruck, Smartphone-Anzeige und Screenshot, sofern der QR-Code vollständig lesbar ist. Soweit angeboten, zusätzlich Apple Wallet und Google Wallet.

2. Persönliche Nutzung und Übertragung
Tickets dürfen privat übertragen oder verschenkt werden. Gewerblicher und automatisierter Weiterverkauf sowie Weiterverkauf mit Gewinnerzielungsabsicht sind untersagt.

3. Verlust und Diebstahl
Bei Verlust oder Diebstahl besteht kein automatischer Anspruch auf Ersatz oder Erstattung. Ticketfeeling kann nach Prüfung einen Ersatz ausstellen, wenn das Originalticket noch nicht entwertet wurde.

4. Einlass
Nur nicht entwertete, gültige Tickets berechtigen zum Einlass. Die erste erfolgreiche Entwertung ist maßgeblich.

5. Missbrauch
Bei Missbrauch, Fälschung oder Verstößen gegen Weiterverkaufsregeln kann der Einlass verweigert werden.

Hinweis: Entwurf für Ticketfeeling – vor Produktivstart fachlich prüfen.`,
  },
  {
    type: "withdrawal",
    version: "1.0.0",
    title: "Widerrufsbelehrung",
    changelog: "Erstveröffentlichung",
    content: `Widerrufsbelehrung
Stand: August 2026

Ausschluss des Widerrufsrechts bei Termintickets

Für den Kauf von Eintrittskarten zu Veranstaltungen mit festem Termin oder Zeitraum besteht gemäß § 312g Abs. 2 Nr. 9 BGB kein gesetzliches Widerrufsrecht.

Mit Vertragsschluss und erfolgreicher Zahlung erwirbt der Kunde daher regelmäßig kein Widerrufsrecht für solche Tickets.

Unberührt bleiben Ansprüche bei Absage, Verlegung oder in sonstigen gesetzlich bzw. vertraglich geregelten Fällen. Einzelheiten enthält die Richtlinie zu Rückerstattung & Verlegung.

Für später angebotene Waren oder Dienstleistungen, bei denen ein Widerrufsrecht besteht, gelten die gesetzlichen Regelungen; ein Muster-Widerrufsformular wird gesondert bereitgestellt.

Unternehmer
${SELLER}

Hinweis: Entwurf für Ticketfeeling – vor Produktivstart fachlich prüfen.`,
  },
  {
    type: "withdrawal_form",
    version: "1.0.1",
    title: "Muster-Widerrufsformular",
    changelog: "Öffentliche Anschrift Landshut",
    content: `Muster-Widerrufsformular
(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück. Dieses Formular gilt nur, soweit ein Widerrufsrecht besteht – nicht für Termintickets nach § 312g Abs. 2 Nr. 9 BGB.)

An:
Peter Loder – Ticketfeeling
${formatCompanyAddressBlock(DEFAULT_PUBLIC_COMPANY_ADDRESS)}
E-Mail: support@ticketfeeling.de

Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*):

Bestellt am (*)/erhalten am (*):
Name des/der Verbraucher(s):
Anschrift des/der Verbraucher(s):
Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):
Datum:

(*) Unzutreffendes streichen.`,
  },
  {
    type: "refund",
    version: "1.0.0",
    title: "Rückerstattung, Terminverlegung & Absage",
    changelog: "Erstveröffentlichung",
    content: `Hinweise zu Rückerstattung, Terminverlegung und Veranstaltungsabsage
Stand: August 2026

1. Terminverlegung
1.1 Bei Verlegung behalten Tickets grundsätzlich ihre Gültigkeit für den neuen Termin.
1.2 Kunden werden per E-Mail informiert, soweit möglich.
1.3 Kulanzregelungen (z. B. Umtausch) kann der Veranstalter freiwillig anbieten.

2. Veranstaltungsabsage
2.1 Bei vollständiger Absage erfolgt die vollständige Rückerstattung des gezahlten Ticketpreises einschließlich erhobener Verwaltungsgebühren.
2.2 Die Rückzahlung erfolgt grundsätzlich automatisch auf das ursprünglich verwendete Zahlungsmittel.
2.3 Ist dies technisch nicht möglich, wird der Käufer informiert und erhält eine alternative Auszahlungsmöglichkeit.
2.4 Ein gesonderter Antrag ist grundsätzlich nicht erforderlich.

3. Programmänderungen
Erhebliche Änderungen, die den Gesamtcharakter wesentlich verändern, können im Einzelfall Erstattungs- oder Umtauschansprüche auslösen. Übliche Programmänderungen begründen grundsätzlich keinen Anspruch.

4. Höhere Gewalt
Bei höherer Gewalt gelten die Regelungen der AGB. Erstattungen bei Absage bleiben nach Abschnitt 2 möglich.

5. Ausschluss bei Fehlverhalten
Bei Ausschluss wegen Verstößen gegen Hausrecht oder Weiterverkaufsregeln besteht grundsätzlich kein Erstattungsanspruch.

Hinweis: Entwurf für Ticketfeeling – vor Produktivstart fachlich prüfen.`,
  },
  {
    type: "cookies",
    version: "1.0.1",
    title: "Cookie-Richtlinie",
    changelog: "Öffentliche Anschrift Landshut",
    content: `Cookie-Richtlinie – Ticketfeeling
Stand: August 2026

1. Was sind Cookies?
Cookies und ähnliche Technologien speichern Informationen auf Ihrem Endgerät oder greifen darauf zu.

2. Kategorien
2.1 Technisch notwendig
Erforderlich für Betrieb, Sicherheit, Login, Warenkorb, Checkout und Einwilligungsspeicherung. Diese werden ohne Einwilligung gesetzt.
2.2 Statistik
Helfen, die Nutzung der Plattform zu verstehen (z. B. Reichweite). Nur nach Einwilligung.
2.3 Marketing
Dienen der Messung und Aussteuerung von Werbung (z. B. Meta Pixel, Google Ads). Nur nach Einwilligung.
2.4 Externe Medien
Ermöglichen eingebettete Inhalte (z. B. YouTube, Karten). Nur nach Einwilligung.

3. Einwilligung und Widerruf
Vor Einwilligung werden nur technisch notwendige Cookies gesetzt. Sie können Ihre Auswahl jederzeit über „Cookie-Einstellungen“ ändern oder widerrufen.

4. Weitere Informationen
Details zur Datenverarbeitung enthält die Datenschutzerklärung unter /recht/datenschutz.

Verantwortlicher:
${SELLER}`,
  },
  {
    type: "privacy",
    version: "1.0.1",
    title: "Datenschutzerklärung",
    changelog: "Öffentliche Anschrift Landshut (Verantwortlicher)",
    content: `Datenschutzerklärung – Ticketfeeling
Stand: August 2026

1. Verantwortlicher
${SELLER}

2. Übersicht
Diese Erklärung informiert Sie gemäß Art. 13 und 14 DSGVO über die Verarbeitung personenbezogener Daten bei Nutzung der Ticketfeeling-Plattform.

3. Besuch der Website
Beim Aufruf der Website werden technisch erforderliche Daten verarbeitet, insbesondere IP-Adresse, Browser- und Geräteinformationen, Betriebssystem, Datum/Uhrzeit, Sprache, Referrer-URL und Server-Logfiles.
Zwecke: Bereitstellung, Sicherheit, Missbrauchserkennung, Fehlersuche.
Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an sicherem Betrieb).
Speicherdauer: Logfiles regelmäßig wenige Tage bis wenige Wochen, sofern keine Sicherheitsgründe längere Aufbewahrung erfordern.

4. Kundenkonto
Verarbeitet werden Name, Anschrift, E-Mail, Telefonnummer (optional), Passwort (nur verschlüsselt/gehasht) und Bestellhistorie.
Zweck: Kontoverwaltung, Bestellungen, Support.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO; Passwortsicherheit Art. 6 Abs. 1 lit. f DSGVO.
Speicherdauer: für die Dauer des Kontos; gesetzliche Aufbewahrungsfristen bleiben unberührt.

5. Ticketbestellung
Verarbeitet werden Veranstaltungsdaten, Sitzplatz/Kategorie, Ticketnummer, QR-Code-Bezug, Zahlungsstatus, Rechnungsdaten und optional Unternehmensdaten.
Zweck: Vertragserfüllung, Einlass, Rechnungsstellung.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO; steuerliche Pflichten Art. 6 Abs. 1 lit. c DSGVO.

6. Zahlungsabwicklung
Zum Start erfolgt die Zahlung über Stripe. Erforderliche Zahlungs- und Transaktionsdaten werden an Stripe übermittelt.
Zweck: Zahlung und Betrugsprävention.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO.
Weitere Zahlungsanbieter können später ergänzt werden; diese Erklärung wird dann aktualisiert.

7. Rechnungsstellung
Rechnungsdaten werden zur Erstellung und Übermittlung von Rechnungen sowie zur Erfüllung steuerrechtlicher Aufbewahrungspflichten verarbeitet (typischerweise 10 Jahre).

8. QR-Code und Einlass
Der QR-Code ist mit der Bestellung/dem Ticket verknüpft. Beim Scan werden Einlasszeitpunkt und Ticketstatus verarbeitet.
Zweck: Zutrittskontrolle, Missbrauchsprävention.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO.
Speicherdauer: mindestens bis Abschluss der Veranstaltung und danach im Rahmen gesetzlicher und berechtigter Aufbewahrungsinteressen.

9. Scan-App
Mitarbeiter mit entsprechenden Rechten können Tickets scannen. Verarbeitet werden Scanzeitpunkt, Ergebnis und Ticketstatus.
Zugriff ist rollenbasiert beschränkt.

10. Newsletter (Vorbereitung)
Sofern ein Newsletter angeboten wird, erfolgt die Anmeldung per Double-Opt-In. Abmeldung ist jederzeit möglich.
Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO.

11. Kontakt und Support
Bei Kontaktaufnahme verarbeiten wir Ihre Angaben zur Bearbeitung der Anfrage (Art. 6 Abs. 1 lit. b oder f DSGVO).

12. Cookies und ähnliche Technologien
Wir unterscheiden technisch notwendige, Statistik-, Marketing- und externe-Medien-Cookies. Details: Cookie-Richtlinie (/recht/cookies).
Statistik- und Marketing-Tools sowie externe Medien erst nach Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).

13. Analyse und Marketing (modular)
Vorbereitet bzw. nach Einwilligung möglich: Google Analytics, Google Tag Manager, Google Ads, Meta Pixel und vergleichbare Dienste.
Diese Dienste werden nur aktiviert, wenn Sie eingewilligt haben. Die Erklärung wird bei konkreten Aktivierungen ergänzt.

14. Social Media und eingebettete Inhalte
Verlinkungen oder Einbettungen zu Facebook, Instagram, YouTube, TikTok sowie Karten- oder Videoinhalte (z. B. Google Maps, YouTube, Vimeo) können Daten an die jeweiligen Anbieter übertragen – in der Regel erst nach Einwilligung für externe Medien.

15. Hosting und Infrastruktur
Die Plattform wird bei einem oder mehreren Hosting- bzw. Cloud-Dienstleistern betrieben (Auftragsverarbeitung nach Art. 28 DSGVO). Dabei können Serverstandorte in der EU/dem EWR oder – mit geeigneten Garantien – in Drittländern liegen. Die konkreten Dienstleister können wechseln; ein Wechsel wird in dieser Erklärung nachgezogen, sobald er feststeht.

16. E-Mail-Versand
Wir versenden Bestellbestätigungen, Tickets, Rechnungen und Support-Nachrichten. Hierzu können E-Mail-Dienstleister als Auftragsverarbeiter eingesetzt werden.

17. Speicherdauer (Überblick)
- Kontodaten: bis Löschung des Kontos, danach Löschung/Anonymisierung, soweit keine Aufbewahrungspflichten
- Bestell- und Rechnungsdaten: gesetzliche Fristen (häufig 6–10 Jahre)
- Scan-/Einlassdaten: bis nach Veranstaltungsende und im Rahmen berechtigter Interessen/Pflichten
- Einwilligungen: Nachweisdauer entsprechend gesetzlicher Anforderungen
- Logfiles: siehe Abschnitt 3

18. Betroffenenrechte
Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit, Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen sowie Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft.
Außerdem besteht ein Beschwerderecht bei einer Datenschutzaufsichtsbehörde.

19. Automatisierte Entscheidungen
Derzeit finden keine ausschließlich automatisierten Entscheidungen mit rechtlicher Wirkung im Sinne von Art. 22 DSGVO statt.

20. Datensicherheit
Wir setzen TLS-Verschlüsselung, gehashte Passwörter, Zugriffsbeschränkungen und ein Berechtigungssystem ein.

21. Minderjährige
Das Angebot richtet sich nicht gezielt an Kinder. Wer unter 16 Jahren personenbezogene Daten übermittelt, sollte die Einwilligung der Erziehungsberechtigten sicherstellen, soweit erforderlich.

22. Änderungen
Diese Datenschutzerklärung wird versioniert. Die jeweils gültige Fassung wird veröffentlicht; beim Ticketkauf wird die dann gültige Version mit der Bestellung gespeichert.

Kontakt für Datenschutzanfragen: support@ticketfeeling.de

Hinweis: Eigenständiger Entwurf für Ticketfeeling – vor Produktivstart fachlich zu prüfen.`,
  },
];
