/**
 * Canonical Hilfe / FAQ content (de-DE).
 * Seeded into `support_knowledge_articles` and shared by `/hilfe` + support chat.
 */

export type SupportKnowledgeSeedArticle = {
  slug: string;
  title: string;
  body: string;
  tags: string[];
};

/** Display order on `/hilfe` (slug). Unknown published articles follow alphabetically. */
export const SUPPORT_KNOWLEDGE_HILFE_ORDER: string[] = [
  "wie-funktioniert-der-kauf",
  "saalplan",
  "bestplatz",
  "freie-platzwahl",
  "warenkorb-reservierung",
  "zahlung",
  "verwaltungsgebuehr",
  "digitale-tickets",
  "meine-tickets",
  "tickets-nicht-gefunden",
  "einlass",
  "gastkauf-konto",
  "rechnung",
  "rabatte-aktionen",
  "erstattung",
];

/**
 * Bump when article content or slug set changes — triggers one sync per process
 * after deploy without a full DB seed.
 */
export const SUPPORT_KNOWLEDGE_SEED_VERSION = 4;

export const SUPPORT_KNOWLEDGE_ARTICLES_DE: SupportKnowledgeSeedArticle[] = [
  {
    slug: "wie-funktioniert-der-kauf",
    title: "Wie funktioniert der Ticketkauf?",
    body: `So einfach geht’s:

1. Event öffnen und Kategorie wählen.
2. Bei nummerierten Sitzplätzen: Bestplatzbuchung oder Saalplan — sonst Menge für Stehplatz / Freie Platzwahl.
3. Alles in den Warenkorb — deine Plätze sind 10 Minuten reserviert.
4. Zur Kasse, Daten prüfen und „Zahlungspflichtig bestellen“.

Nach erfolgreicher Zahlung: Tickets per E-Mail (QR-Code + PDF) und im Konto. Kein Postversand — alles digital.`,
    tags: ["kauf", "checkout", "bestellen", "warenkorb", "bestplatz", "saalplan"],
  },
  {
    slug: "saalplan",
    title: "Saalplan: Plätze selbst wählen",
    body: `Beim Saalplan siehst du den Plan der Halle und wählst deine Sitzplätze selbst — Block, Reihe und Platz.

Tipps:
• Nur nummerierte Sitzplätze erscheinen im Saalplan.
• Stehplätze und Freie Platzwahl buchst du separat darunter über die Menge.
• Gewählte Plätze werden für 10 Minuten im Warenkorb reserviert.

Ob ein Event Saalplan anbietet, steht auf der Eventseite unter „Sitzplätze“ (Button „Saalplan wählen“).`,
    tags: ["saalplan", "sitzplatz", "plätze", "platzwahl", "karte", "plan", "nummeriert"],
  },
  {
    slug: "bestplatz",
    title: "Bestplatzbuchung: System wählt die besten Plätze",
    body: `Bei der Bestplatzbuchung sucht Ticketfeeling automatisch die besten freien Plätze für dich — möglichst nebeneinander in einer Reihe.

Du brauchst den Plan nicht selbst zu klicken: Kategorie und Anzahl wählen, fertig. Stehplätze und Freie Platzwahl bleiben separat (Menge wählen).

Viele Events bieten beides: Umschalten zwischen „Bestplatzbuchung“ und „Saalplan wählen“. Manche Events haben nur Bestplatzbuchung.`,
    tags: ["bestplatz", "bestplatzbuchung", "automatisch", "sitzplatz", "nebeneinander"],
  },
  {
    slug: "freie-platzwahl",
    title: "Freie Platzwahl, Stehplatz und nummerierte Sitze",
    body: `Kurz erklärt:

• Nummerierte Sitze — fester Block, Reihe und Platz (Saalplan oder Bestplatzbuchung).
• Freie Platzwahl — Sitzplatz ohne feste Nummer; du suchst dir vor Ort einen freien Platz in dem Bereich.
• Stehplatz — Stehbereich, ohne Sitzplatznummer.

Auf dem Ticket steht klar, was du gebucht hast (z. B. „Reihe 5 · Platz 12“, „Freie Platzwahl“ oder „Stehplatz“).`,
    tags: ["freie platzwahl", "stehplatz", "nummeriert", "kategorie", "ga"],
  },
  {
    slug: "warenkorb-reservierung",
    title: "Warenkorb: Wie lange sind Plätze reserviert?",
    body: `Sobald Tickets im Warenkorb liegen, sind sie 10 Minuten für dich reserviert. Der Countdown „Reservierung“ zeigt die Restzeit.

Läuft die Zeit ab, werden die Plätze wieder freigegeben — dann einfach neu wählen. Reminder kommen bei noch 5 und noch 2 Minuten.

Tipp: Zur Kasse gehen, solange die Reservierung läuft. Bei Lastschrift (SEPA) kann die Platzhaltung bis zur Zahlungsbestätigung länger gelten — Details siehst du im Checkout.`,
    tags: ["warenkorb", "reservierung", "zeitlimit", "hold", "countdown", "10 minuten"],
  },
  {
    slug: "zahlung",
    title: "Wie kann ich bezahlen?",
    body: `Du zahlst online im Checkout. Je nach Gerät und Event stehen zur Verfügung:

• Lastschrift vom Bankkonto (SEPA) — oft empfohlen
• Kredit- oder Debitkarte (Visa / Mastercard)
• Apple Pay und Google Pay (wenn dein Gerät das anbietet)
• Klarna (später oder in Raten)

PayPal gibt es bei Ticketfeeling nicht.

Der Betrag wird erst mit „Zahlungspflichtig bestellen“ fällig. Kurz vor dem Event kann SEPA abgeschaltet sein — dann helfen Karte, Wallets oder Klarna.

Nach erfolgreicher Kartenzahlung / Wallet / Klarna sind Tickets sofort da. Bei SEPA-Lastschrift erst nach bestätigter Zahlung.`,
    tags: [
      "zahlung",
      "bezahlen",
      "karte",
      "sepa",
      "lastschrift",
      "klarna",
      "apple pay",
      "google pay",
      "checkout",
    ],
  },
  {
    slug: "verwaltungsgebuehr",
    title: "Was ist die Verwaltungsgebühr?",
    body: `Zum Ticketpreis kommt zzgl. eine Verwaltungsgebühr (aktuell in der Regel 4 %). Auf Eventseiten und „ab“-Preisen steht das klar als „zzgl. 4 % Verwaltungsgebühr“ — im Warenkorb und Checkout siehst du den Betrag als eigene Zeile.

Die Verwaltungsgebühr deckt u. a.:
• Plattformbetrieb und sichere Zahlungsabwicklung
• Tickets, QR-Codes und Einlasskontrolle
• Persönlichen Support und Weiterentwicklung

Wichtig: Dein Preis ist Tickets + Verwaltungsgebühr — unabhängig von der Zahlungsart. Es gibt keinen Aufpreis für Karte, SEPA, Klarna oder Wallets.`,
    tags: [
      "gebühr",
      "gebühren",
      "verwaltungsgebühr",
      "zzgl",
      "servicegebühr",
      "preis",
      "4%",
    ],
  },
  {
    slug: "digitale-tickets",
    title: "Tickets nur digital — QR-Code und PDF",
    body: `Bei Ticketfeeling gibt es keinen Postversand und keine Plastikkarte per Brief.

Du bekommst:
• QR-Code zum Vorzeigen auf dem Smartphone
• PDF-Ticket zum Speichern oder Ausdrucken (Print@Home)

Beides kommt per E-Mail nach erfolgreicher Zahlung — und liegt im Konto zum Download. Am Einlass reicht ein gut lesbarer QR-Code (Handy, Ausdruck oder Screenshot).`,
    tags: [
      "digital",
      "pdf",
      "qr",
      "versand",
      "print",
      "print@home",
      "email",
      "kein versand",
    ],
  },
  {
    slug: "meine-tickets",
    title: "Wo sind meine Tickets?",
    body: `Mit Login: unter „Konto“ findest du Bestellungen und kannst PDF-Tickets mit QR-Code herunterladen — oder „Ticket erneut senden“.

Ohne Login / Gastkauf: „Ticket vergessen“ auf der Hilfe-Seite. Mit Bestell-E-Mail plus Bestellnummer oder Nachname bekommst du einen sicheren Link (auch Spam-Ordner prüfen).

Geschafft — sobald die Zahlung durch ist, sind deine Tickets digital da.`,
    tags: ["tickets", "konto", "pdf", "qr", "download", "erneut senden"],
  },
  {
    slug: "tickets-nicht-gefunden",
    title: "Ticket vergessen — erneut erhalten",
    body: `Keine Mail gefunden oder Handy gewechselt? Kein Problem.

1. Öffne „Ticket vergessen“.
2. Gib die E-Mail deiner Bestellung ein — plus Bestellnummer oder Nachname.
3. Wir senden einen sicheren Link (gültig für kurze Zeit, einmal nutzbar).

Aus Sicherheitsgründen reicht die E-Mail allein nicht. Ob eine Bestellung existiert, sagen wir nicht preis — bei Treffer kommt die Mail. Spam-Ordner nicht vergessen. Mit Kundenkonto liegen Tickets dauerhaft unter „Konto“.`,
    tags: ["ticket vergessen", "verloren", "erneut", "email", "hilfe", "zugang", "link"],
  },
  {
    slug: "einlass",
    title: "Einlass: QR-Code vorzeigen",
    body: `Am Einlass einfach den QR-Code vorzeigen — auf dem Handy oder ausgedruckt. Der Code darf vollständig und gut lesbar sein.

Einlasszeiten stehen auf der Eventseite und auf deinem Ticket. VIP-Einlass kann früher starten, wenn ausgewiesen. Ein Lichtbildausweis kann verlangt werden.

Der QR-Code wird beim ersten erfolgreichen Scan entwertet. Ob ein Wiedereintritt möglich ist, entscheidet der Veranstalter vor Ort.`,
    tags: ["einlass", "qr", "scannen", "entwertung", "ausweis", "beginn", "türen"],
  },
  {
    slug: "gastkauf-konto",
    title: "Gastkauf oder Kundenkonto?",
    body: `Beides geht:

• Als Gast kaufen — schnell, Daten nur für diese Bestellung. Es wird kein Login-Konto angelegt. Tickets kommen per E-Mail; später hilft „Ticket vergessen“.
• Konto anlegen — E-Mail und Passwort. Bestellungen und Tickets liegen zentral unter „Konto“, inklusive „Ticket erneut senden“.

Im eingebetteten Shop (z. B. auf einer Veranstalter-Website) ist Gastkauf oft am einfachsten.`,
    tags: ["gast", "gastkauf", "konto", "account", "login", "registrieren", "anmelden"],
  },
  {
    slug: "rechnung",
    title: "Rechnung und Beleg",
    body: `Im Checkout kannst du „Ich benötige eine Rechnung“ anhaken — privat oder mit Firmendaten / USt-Id.

Nach dem Kauf steht die Rechnung als PDF zum Download bereit (und kommt in der Regel auch mit der Bestellmail). Rechnungen sind elektronisch.

Ohne extra Häkchen hast du trotzdem deine Bestellbestätigung und Tickets — die Rechnung ist optional für deine Unterlagen.`,
    tags: ["rechnung", "beleg", "invoice", "ust", "firma", "pdf"],
  },
  {
    slug: "rabatte-aktionen",
    title: "Rabatte, Aktionen und Gutscheincodes",
    body: `Manchmal gibt es Aktionspreise oder Rabattcodes — das steht klar auf der Eventseite (z. B. Aktionsbadge) und im Warenkorb.

Kurz:
• Laufende Preisaktionen siehst du direkt beim Ticket (durchgestrichener Preis / Badge).
• Einen Rabatt- oder Gutscheincode kannst du im Warenkorb eingeben, wenn das Event das erlaubt.
• Aktionspreise und Codes sind oft nicht kombinierbar — der Checkout zeigt dir, was gilt.
• Die Verwaltungsgebühr bezieht sich auf den Ticketpreis laut Checkout; Details siehst du vor dem Bestellen.

Konkrete aktuelle Rabatte erfinden wir hier nicht — am besten Event öffnen oder im Chat nach dem Eventnamen fragen.`,
    tags: [
      "rabatt",
      "aktion",
      "gutschein",
      "promo",
      "code",
      "sparen",
      "preisaktion",
      "sommer",
    ],
  },
  {
    slug: "erstattung",
    title: "Storno, Umbuchung und Erstattung",
    body: `Für Termintickets gibt es kein gesetzliches Widerrufsrecht (§ 312g Abs. 2 Nr. 9 BGB).

Kurz nach unseren AGB / Rückerstattungshinweisen:
• Absage der Veranstaltung — volle Erstattung von Ticketpreis und Verwaltungsgebühr auf den ursprünglichen Zahlungsweg.
• Terminverlegung — Tickets bleiben in der Regel für den neuen Termin gültig. Freiwillige Kulanz (z. B. Umtausch) kann der Veranstalter anbieten.
• Eigenes Storno nur weil du nicht mehr kannst — kein automatischer Anspruch. Im Einzelfall hilft der Kundenservice.

Der Chat storniert und erstattet nicht selbst. Details: Seite „Rückerstattung, Terminverlegung & Absage“ unter Rechtliches — oder Kundenservice schreiben.`,
    tags: [
      "erstattung",
      "storno",
      "widerruf",
      "umbuchung",
      "verlegung",
      "absage",
      "rückerstattung",
    ],
  },
];

/** Slugs ever managed by seed/sync — obsolete ones are pruned so /hilfe stays clean. */
export const SUPPORT_KNOWLEDGE_MANAGED_SLUGS: string[] = [
  ...SUPPORT_KNOWLEDGE_ARTICLES_DE.map((a) => a.slug),
];
