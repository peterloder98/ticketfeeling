export const LEGAL_DOCUMENT_TYPES = [
  "impressum",
  "privacy",
  "terms",
  "event_terms",
  "ticket_conditions",
  "withdrawal",
  "withdrawal_form",
  "refund",
  "cookies",
] as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export const LEGAL_TYPE_META: Record<
  LegalDocumentType,
  { slug: string; label: string; description: string }
> = {
  impressum: {
    slug: "impressum",
    label: "Impressum",
    description: "Anbieterkennzeichnung nach § 5 DDG",
  },
  privacy: {
    slug: "datenschutz",
    label: "Datenschutzerklärung",
    description: "Informationen nach Art. 13/14 DSGVO",
  },
  terms: {
    slug: "agb",
    label: "AGB",
    description: "Allgemeine Geschäftsbedingungen Ticketshop",
  },
  event_terms: {
    slug: "veranstaltungsbedingungen",
    label: "Veranstaltungsbedingungen",
    description: "Einlass, Hausrecht, Programm",
  },
  ticket_conditions: {
    slug: "ticketbedingungen",
    label: "Ticketbedingungen",
    description: "Digitale Tickets, QR-Code, Übertragung",
  },
  withdrawal: {
    slug: "widerruf",
    label: "Widerrufsbelehrung",
    description: "Widerruf und Ausschluss bei Termintickets",
  },
  withdrawal_form: {
    slug: "widerrufsformular",
    label: "Muster-Widerrufsformular",
    description: "Formular für Fälle mit Widerrufsrecht",
  },
  refund: {
    slug: "rueckerstattung",
    label: "Rückerstattung & Verlegung",
    description: "Absage, Verlegung, Erstattung",
  },
  cookies: {
    slug: "cookies",
    label: "Cookie-Richtlinie",
    description: "Notwendige, Statistik-, Marketing-Cookies",
  },
};

export const PUBLIC_SLUG_TO_TYPE: Record<string, LegalDocumentType> = Object.fromEntries(
  Object.entries(LEGAL_TYPE_META).map(([type, meta]) => [meta.slug, type as LegalDocumentType]),
) as Record<string, LegalDocumentType>;

/** Types that must be snapshotted on checkout. */
export const CHECKOUT_LEGAL_TYPES: LegalDocumentType[] = [
  "terms",
  "event_terms",
  "privacy",
  "withdrawal",
  "refund",
];
