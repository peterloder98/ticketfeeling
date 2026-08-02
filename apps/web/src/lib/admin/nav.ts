export type AdminNavItem = {
  href: string;
  label: string;
  /** Path prefixes that keep this top item active */
  match?: string[];
};

/** Flat sidebar — only top-level sections. */
export const ADMIN_TOP_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", match: ["/admin"] },
  { href: "/admin/events", label: "Events", match: ["/admin/events"] },
  { href: "/admin/orders", label: "Bestellungen", match: ["/admin/orders"] },
  { href: "/admin/kunden", label: "Kunden", match: ["/admin/kunden"] },
  {
    href: "/admin/verkauf",
    label: "Verkauf",
    match: ["/admin/verkauf", "/kasse", "/scanner", "/admin/partner", "/admin/discounts"],
  },
  {
    href: "/admin/katalog",
    label: "Katalog",
    match: [
      "/admin/katalog",
      "/admin/catalog",
      "/admin/artists",
      "/admin/locations",
      "/admin/tours",
    ],
  },
  {
    href: "/admin/einstellungen",
    label: "Einstellungen",
    match: ["/admin/einstellungen", "/admin/stammdaten"],
  },
  {
    href: "/admin/system",
    label: "System",
    match: ["/admin/system", "/admin/support", "/admin/audit"],
  },
];

export type AdminSubNavItem = {
  href: string;
  label: string;
  description?: string;
};

export const ADMIN_SUBNAV = {
  verkauf: [
    { href: "/admin/verkauf", label: "Übersicht", description: "Alle Verkaufswerkzeuge" },
    { href: "/kasse", label: "Tageskasse", description: "Vor-Ort-Verkauf" },
    { href: "/kasse/verkaeufe", label: "Kasse-Verkäufe", description: "Verkaufshistorie" },
    { href: "/admin/partner", label: "Vorverkaufs-Partner", description: "Partner & Einladungen" },
    { href: "/scanner", label: "Einlass-Scanner", description: "Check-in vor Ort" },
    { href: "/admin/discounts", label: "Rabatte", description: "Codes & Aktionen" },
  ] satisfies AdminSubNavItem[],
  katalog: [
    { href: "/admin/katalog", label: "Übersicht", description: "Katalog & Stammdaten" },
    {
      href: "/admin/catalog",
      label: "Kategorie-Vorlagen",
      description: "Ticketkategorien wiederverwenden",
    },
    { href: "/admin/artists", label: "Künstler", description: "Line-up & Profile" },
    { href: "/admin/locations", label: "Locations", description: "Orte & Räume" },
    {
      href: "/admin/tours",
      label: "Touren",
      description: "Tour anlegen, dann Termine",
    },
  ] satisfies AdminSubNavItem[],
  einstellungen: [
    { href: "/admin/einstellungen", label: "Übersicht", description: "Einstellungen im Überblick" },
    {
      href: "/admin/stammdaten",
      label: "Unternehmen & Seite",
      description: "Rechtliches, Tracking, TSE",
    },
    {
      href: "/admin/einstellungen/email",
      label: "E-Mail-Konten",
      description: "SMTP & Versandtest",
    },
    {
      href: "/admin/einstellungen/preise",
      label: "Preise und Gebühren",
      description: "Verwaltungsgebühr",
    },
    {
      href: "/admin/einstellungen/zahlungen",
      label: "Zahlungen (Stripe)",
      description: "Stripe-Kosten, SEPA-Regeln",
    },
    {
      href: "/admin/einstellungen/embed",
      label: "Website-Einbindung",
      description: "iframe Shop & Event",
    },
  ] satisfies AdminSubNavItem[],
  system: [
    { href: "/admin/system", label: "Übersicht", description: "Support & Protokoll" },
    { href: "/admin/support", label: "Support", description: "Anfragen & Chat" },
    { href: "/admin/audit", label: "Audit-Log", description: "Protokoll" },
  ] satisfies AdminSubNavItem[],
} as const;

/** Hub cards omit the Übersicht self-link. */
export function adminHubItems(section: keyof typeof ADMIN_SUBNAV) {
  return ADMIN_SUBNAV[section].filter((item) => item.label !== "Übersicht");
}

/** @deprecated use ADMIN_TOP_NAV — kept for any stray imports */
export const ADMIN_NAV = [{ label: "Menü", items: ADMIN_TOP_NAV }];

export function isAdminNavActive(pathname: string, item: AdminNavItem) {
  if (item.href === "/admin") return pathname === "/admin";
  const prefixes = item.match ?? [item.href];
  return prefixes.some((prefix) => {
    if (prefix === "/admin") return pathname === "/admin";
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export function isAdminSubnavActive(pathname: string, href: string) {
  // Hub "Übersicht" — exact only (otherwise child routes steal the highlight)
  if (
    href === "/admin/verkauf" ||
    href === "/admin/katalog" ||
    href === "/admin/einstellungen" ||
    href === "/admin/system"
  ) {
    return pathname === href;
  }
  if (href === "/kasse") {
    return pathname === "/kasse" || pathname.startsWith("/kasse/beleg");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf (kein Verkauf)",
  announcement: "Ankündigung (kein Verkauf)",
  presale_active: "Verkauf freigegeben",
  published: "Veröffentlicht",
  sold_out: "Ausverkauft",
  cancelled: "Abgesagt",
  completed: "Beendet",
};

export function eventStatusLabel(status: string) {
  return EVENT_STATUS_LABELS[status] ?? status;
}
