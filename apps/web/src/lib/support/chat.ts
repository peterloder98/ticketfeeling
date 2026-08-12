import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import {
  categoryInventoryCapacity,
  sharedRemainingQuantity,
} from "@/lib/commerce/inventory-availability";
import { writeAudit } from "@/lib/audit";
import { formatEuroFromCents } from "@/lib/money";
import { ensureSupportKnowledge } from "@/lib/support/sync-knowledge";

export type ChatResult = {
  sessionId: string;
  intent: string;
  answer: string;
  suggestedActions: { label: string; href: string }[];
  sources: { title: string; slug: string }[];
};

const PUBLIC_STATUSES = ["announcement", "published", "presale_active"] as const;

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectIntent(message: string): string {
  const m = normalize(message);

  if (
    m.includes("ticket vergessen") ||
    m.includes("tickets nicht") ||
    m.includes("keine tickets") ||
    m.includes("mail nicht") ||
    m.includes("e-mail nicht") ||
    m.includes("ticket verloren") ||
    m.includes("nicht bekommen") ||
    m.includes("erneut senden") ||
    m.includes("ticket erneut")
  ) {
    return "forgotten_ticket";
  }
  if (
    m.includes("verwaltungsgebuhr") ||
    m.includes("servicegebuhr") ||
    ((m.includes("gebuhr") || m.includes("gebuehr")) &&
      (m.includes("was") || m.includes("warum") || m.includes("zzgl") || m.includes("inkl")))
  ) {
    return "fees";
  }
  if (
    m.includes("saalplan") ||
    m.includes("bestplatz") ||
    m.includes("sitzplatz") ||
    m.includes("sitzplatze") ||
    m.includes("freie platzwahl") ||
    m.includes("stehplatz") ||
    m.includes("platze wahlen") ||
    m.includes("plätze wählen") ||
    m.includes("platz auswahlen") ||
    m.includes("platz auswählen") ||
    m.includes("nummerierte")
  ) {
    return "seating";
  }
  if (
    m.includes("kein versand") ||
    m.includes("postversand") ||
    m.includes("per post") ||
    m.includes("print@home") ||
    m.includes("print at home") ||
    (m.includes("digital") && m.includes("ticket")) ||
    (m.includes("qr") && (m.includes("ticket") || m.includes("pdf") || m.includes("code")))
  ) {
    return "digital_tickets";
  }
  if (
    (m.includes("warenkorb") &&
      (m.includes("minut") || m.includes("reserv") || m.includes("zeit") || m.includes("ablauf"))) ||
    m.includes("reservierung abgelaufen") ||
    m.includes("10 minuten") ||
    m.includes("hold")
  ) {
    return "cart_hold";
  }
  if (
    m.includes("rechnung") ||
    m.includes("beleg") ||
    m.includes("ust-id") ||
    m.includes("umsatzsteuer")
  ) {
    return "invoice";
  }
  if (
    /\bvip\b/.test(m) ||
    m.includes("vip ticket") ||
    m.includes("vip karte") ||
    m.includes("vip noch") ||
    (m.includes("gibt es noch") && m.includes("vip"))
  ) {
    return "vip_availability";
  }
  if (
    m.includes("preis") ||
    m.includes("kostet") ||
    m.includes("kosten") ||
    m.includes("wie teuer") ||
    m.includes("ticketkategorie") ||
    m.includes("kategorien") ||
    m.includes("kontingent") ||
    (m.includes("ticket") && (m.includes("euro") || m.includes("€") || m.includes("ab ")))
  ) {
    return "ticket_prices";
  }
  if (
    m.includes("dabei") ||
    m.includes("tritt auf") ||
    m.includes("line[- ]?up") ||
    m.includes("lineup") ||
    m.includes("kuenstler") ||
    m.includes("künstler") ||
    m.includes("artist") ||
    m.includes("wer spielt") ||
    (m.includes("welche events") && (m.includes("von") || m.includes("mit")))
  ) {
    return "artist_events";
  }
  if (
    m.includes("meine tickets") ||
    m.includes("wo sind meine") ||
    m.includes("ticket download") ||
    m.includes("pdf") ||
    (m.includes("tickets") && (m.includes("finden") || m.includes("abrufen") || m.includes("anzeigen")))
  ) {
    return "my_tickets";
  }
  if (
    m.includes("zahl") ||
    m.includes("bezahlen") ||
    m.includes("paypal") ||
    m.includes("karte") ||
    m.includes("kreditkarte") ||
    m.includes("zahlungsmittel") ||
    m.includes("sepa") ||
    m.includes("lastschrift") ||
    m.includes("klarna") ||
    m.includes("apple pay") ||
    m.includes("google pay")
  ) {
    return "payment";
  }
  if (
    m.includes("warenkorb") ||
    m.includes("bestell") ||
    m.includes("kauf") ||
    m.includes("buchen") ||
    m.includes("wie bestelle") ||
    m.includes("checkout") ||
    m.includes("ticket kaufen")
  ) {
    return "order_howto";
  }
  if (
    m.includes("erstatt") ||
    m.includes("storno") ||
    m.includes("ruckerstatt") ||
    m.includes("rückerstatt") ||
    m.includes("widerruf") ||
    m.includes("umbuchung") ||
    m.includes("verlegung")
  ) {
    return "refund_info";
  }
  if (
    m.includes("einlass") ||
    m.includes("qr scannen") ||
    m.includes("qr-code") ||
    m.includes("beginn") ||
    m.includes("uhrzeit") ||
    m.includes("wann") ||
    m.includes("wo findet") ||
    m.includes("location") ||
    m.includes("veranstaltungsort") ||
    m.includes("event") ||
    m.includes("konzert") ||
    m.includes("schlager") ||
    m.includes("open air")
  ) {
    return "event_info";
  }
  if (
    m.includes("anmeld") ||
    m.includes("login") ||
    m.includes("registr") ||
    m.includes("passwort") ||
    m.includes("gastkauf") ||
    m.includes("als gast") ||
    m.includes("kundenkonto")
  ) {
    return "account";
  }
  if (
    m.includes("mensch") ||
    m.includes("support") ||
    m.includes("mitarbeiter") ||
    m.includes("agent") ||
    m.includes("kundenservice") ||
    m.includes("kontakt")
  ) {
    return "handoff_human";
  }
  return "faq_general";
}

async function articleBySlug(organizationId: string, slug: string) {
  return prisma.supportKnowledgeArticle.findFirst({
    where: { organizationId, slug, status: "published", visibility: "public" },
  });
}

async function answerFromArticle(
  organizationId: string,
  slug: string,
  fallback: string,
  sources: { title: string; slug: string }[],
) {
  const article = await articleBySlug(organizationId, slug);
  if (article) {
    sources.push({ title: article.title, slug: article.slug });
    return article.body;
  }
  return fallback;
}

async function findDefaultOrganizationId() {
  const org = await prisma.organization.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
  });
  return org?.id ?? null;
}

async function searchKnowledge(organizationId: string, message: string) {
  const articles = await prisma.supportKnowledgeArticle.findMany({
    where: { organizationId, status: "published", visibility: "public" },
    take: 50,
  });
  const tokens = normalize(message)
    .split(/[^a-z0-9äöüß]+/i)
    .filter((t) => t.length > 2);
  return articles
    .map((article) => {
      const hay = normalize(`${article.title} ${article.body} ${article.tags.join(" ")}`);
      let score = 0;
      for (const token of tokens) if (hay.includes(token)) score += 1;
      return { article, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.article);
}

type EventWithCats = Awaited<ReturnType<typeof loadPublicEvents>>[number];

async function loadPublicEvents(organizationId: string) {
  return prisma.event.findMany({
    where: { organizationId, status: { in: [...PUBLIC_STATUSES] } },
    include: {
      location: true,
      ticketCategories: {
        where: { status: "active", onlineBookable: true },
        include: { pools: true },
        orderBy: { sortOrder: "asc" },
      },
      artists: {
        where: { announced: true, cancelled: false },
        include: { artist: true },
        orderBy: { sortOrder: "asc" },
      },
      tour: {
        select: {
          artists: {
            where: { announced: true, cancelled: false },
            include: { artist: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
    orderBy: { eventStartsAt: "asc" },
    take: 40,
  });
}

function eventArtistNames(event: EventWithCats) {
  const inherit = Boolean(event.tourId && event.artistsUseTourDefaults !== false);
  const links = inherit && event.tour?.artists ? event.tour.artists : event.artists;
  return links.map((a) => a.artist.name);
}

function eventArtistLinks(event: EventWithCats) {
  const inherit = Boolean(event.tourId && event.artistsUseTourDefaults !== false);
  return inherit && event.tour?.artists ? event.tour.artists : event.artists;
}

function scoreEvent(event: EventWithCats, message: string) {
  const m = normalize(message);
  const hay = normalize(
    [
      event.name,
      event.subtitle ?? "",
      event.shortDescription ?? "",
      event.location?.name ?? "",
      event.location?.city ?? "",
      ...eventArtistNames(event),
    ].join(" "),
  );
  const stop = new Set([
    "event",
    "events",
    "wann",
    "wo",
    "gibt",
    "ticket",
    "tickets",
    "konzert",
    "preis",
    "preise",
    "kosten",
    "kostet",
    "vip",
    "karte",
    "karten",
    "noch",
    "verfugbar",
    "verfügbar",
    "wie",
    "viel",
    "euro",
  ]);
  const tokens = m
    .split(/[^a-z0-9äöüß]+/i)
    .filter((t) => t.length > 2 && !stop.has(t));

  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += 2;
  }
  if (m.includes("open air") && hay.includes("open air")) score += 6;
  if (m.includes("schlagernacht") && hay.includes("schlagernacht")) score += 6;
  if (m.includes("schlagerfeeling") && hay.includes("schlagerfeeling")) score += 6;
  if (m.includes("ergolding") && hay.includes("ergolding")) score += 4;
  if (m.includes("bruckberg") && hay.includes("bruckberg")) score += 4;
  if (m.includes("herzen") && hay.includes("herzen")) score += 3;
  return score;
}

function pickEvents(events: EventWithCats[], message: string, limit = 3) {
  const scored = events
    .map((event) => ({ event, score: scoreEvent(event, message) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length > 0) return scored.slice(0, limit).map((x) => x.event);
  return events.slice(0, Math.min(limit, events.length));
}

function categoryAvailability(cat: EventWithCats["ticketCategories"][number]) {
  const sold = cat.pools.reduce((s, p) => s + p.soldQuantity, 0);
  const held = cat.pools.reduce((s, p) => s + p.heldQuantity, 0);
  const capacity = categoryInventoryCapacity(cat.capacity);
  const remaining = sharedRemainingQuantity(cat.pools, cat.capacity);
  return { sold, held, capacity, remaining };
}

function formatPrices(event: EventWithCats) {
  if (event.ticketCategories.length === 0) {
    return "Aktuell sind noch keine Ticketkategorien freigeschaltet.";
  }
  const lines = event.ticketCategories.map((cat) => {
    const { remaining, capacity } = categoryAvailability(cat);
    const status =
      remaining <= 0
        ? "ausverkauft"
        : remaining <= Math.max(5, Math.floor(capacity * 0.05))
          ? `nur noch ${remaining} frei`
          : `${remaining} von ${capacity} frei`;
    return `• ${cat.name}: ${formatEuroFromCents(cat.priceGrossCents)} — ${status}`;
  });
  const from = Math.min(...event.ticketCategories.map((c) => c.priceGrossCents));
  return `Preise für „${event.name}“ (ab ${formatEuroFromCents(from)}):\n${lines.join("\n")}`;
}

function findVipCategories(event: EventWithCats) {
  return event.ticketCategories.filter((c) => /vip/i.test(c.name) || /vip/i.test(c.description ?? ""));
}

async function findArtists(organizationId: string, message: string) {
  const artists = await prisma.artist.findMany({
    where: {
      organizationId,
      OR: [
        { visibility: { in: ["public", "published", "visible"] } },
        { visibility: "draft" }, // include if only drafts exist in early setups
      ],
    },
    take: 80,
  });
  const pool = artists;

  const m = normalize(message);
  const scored = pool
    .map((artist) => {
      const name = normalize(artist.name);
      let score = 0;
      if (m.includes(name)) score += 10;
      const parts = name.split(/\s+/).filter((p) => p.length > 2);
      for (const part of parts) {
        if (m.includes(part)) score += 3;
      }
      return { artist, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map((x) => x.artist);
}

const FALLBACKS: Record<string, { answer: string; actions: { label: string; href: string }[] }> = {
  order_howto: {
    answer:
      "So bestellst du bei Ticketfeeling:\n1) Event öffnen, Kategorie wählen\n2) Bei Sitzplätzen: Bestplatzbuchung oder Saalplan — sonst Menge für Stehplatz / Freie Platzwahl\n3) In den Warenkorb (10 Minuten reserviert)\n4) Zur Kasse und zahlungspflichtig bestellen\nDanach Tickets per E-Mail (QR + PDF) — kein Postversand.",
    actions: [
      { label: "Events ansehen", href: "/events" },
      { label: "Warenkorb", href: "/warenkorb" },
      { label: "Hilfe", href: "/hilfe" },
    ],
  },
  payment: {
    answer:
      "Im Checkout zahlst du online: Lastschrift (SEPA), Kredit-/Debitkarte, Apple Pay, Google Pay oder Klarna — je nach Gerät und Event. PayPal gibt es nicht. Fällig wird der Betrag erst mit „Zahlungspflichtig bestellen“. Nach Kartenzahlung/Wallet/Klarna sind Tickets sofort da; bei SEPA nach bestätigter Zahlung.",
    actions: [
      { label: "Zur Kasse", href: "/checkout" },
      { label: "Hilfe: Zahlung", href: "/hilfe" },
    ],
  },
  my_tickets: {
    answer:
      "Tickets sind nur digital (QR + PDF). Mit Login unter „Konto“ downloaden oder erneut senden. Ohne Zugang: „Ticket vergessen“ mit Bestell-E-Mail plus Bestellnummer oder Nachname.",
    actions: [
      { label: "Zum Konto", href: "/konto" },
      { label: "Ticket vergessen", href: "/hilfe/ticket-vergessen" },
    ],
  },
  account: {
    answer:
      "Gastkauf geht ohne Konto — Tickets per E-Mail, später „Ticket vergessen“. Mit Kundenkonto liegen Bestellungen und Tickets dauerhaft unter „Konto“. Anmelden über „Anmelden“.",
    actions: [
      { label: "Anmelden", href: "/login" },
      { label: "Ticket vergessen", href: "/hilfe/ticket-vergessen" },
    ],
  },
  seating: {
    answer:
      "Bei nummerierten Sitzen: Bestplatzbuchung (wir wählen die besten Plätze, möglichst nebeneinander) oder Saalplan (selbst klicken). Stehplatz und Freie Platzwahl buchst du über die Menge — ohne Sitznummer. Details stehen unter Sitzplätze auf der Eventseite.",
    actions: [
      { label: "Events", href: "/events" },
      { label: "Hilfe", href: "/hilfe" },
    ],
  },
  fees: {
    answer:
      "Zum Ticketpreis kommt zzgl. 4 % Verwaltungsgebühr. Sie deckt Plattform, Zahlung, Tickets/QR/Einlass und Support. Im Warenkorb siehst du den Betrag als eigene Zeile — ohne Aufpreis je nach Zahlungsart.",
    actions: [{ label: "Hilfe", href: "/hilfe" }],
  },
  digital_tickets: {
    answer:
      "Kein Postversand: Du bekommst QR-Code und PDF per E-Mail sowie im Konto — zum Vorzeigen auf dem Handy oder Ausdrucken (Print@Home).",
    actions: [
      { label: "Zum Konto", href: "/konto" },
      { label: "Ticket vergessen", href: "/hilfe/ticket-vergessen" },
    ],
  },
  cart_hold: {
    answer:
      "Im Warenkorb sind Plätze 10 Minuten reserviert. Der Countdown „Reservierung“ zeigt die Restzeit — danach bitte neu wählen.",
    actions: [
      { label: "Warenkorb", href: "/warenkorb" },
      { label: "Events", href: "/events" },
    ],
  },
  invoice: {
    answer:
      "Im Checkout kannst du „Ich benötige eine Rechnung“ anhaken. Danach steht die Rechnung als PDF bereit — optional zu Tickets und Bestellbestätigung.",
    actions: [
      { label: "Konto", href: "/konto" },
      { label: "Hilfe", href: "/hilfe" },
    ],
  },
};

export async function handleSupportChat(input: {
  message: string;
  sessionId?: string;
  organizationId?: string;
  visitorId?: string;
  channel?: string;
}): Promise<ChatResult> {
  const organizationId =
    input.organizationId ?? (await findDefaultOrganizationId());
  if (!organizationId) throw new Error("NO_ORGANIZATION");

  await ensureSupportKnowledge(organizationId);

  const intent = detectIntent(input.message);
  const normalizedMessage = normalize(input.message);
  let session = input.sessionId
    ? await prisma.supportChatSession.findUnique({ where: { id: input.sessionId } })
    : null;

  if (!session || session.organizationId !== organizationId) {
    session = await prisma.supportChatSession.create({
      data: {
        organizationId,
        visitorId:
          input.visitorId ??
          createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 16),
        channel: input.channel ?? "widget",
        status: "open",
      },
    });
  }

  await prisma.supportChatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: input.message,
      intent,
    },
  });

  const sources: { title: string; slug: string }[] = [];
  let answer = "";
  const suggestedActions: { label: string; href: string }[] = [];
  const events = await loadPublicEvents(organizationId);

  if (intent === "forgotten_ticket") {
    answer = await answerFromArticle(
      organizationId,
      "tickets-nicht-gefunden",
      "Über „Ticket vergessen“ kannst du einen sicheren Link anfordern. Dafür brauchst du deine Bestell-E-Mail plus Bestellnummer oder Nachname — nur die E-Mail reicht aus Sicherheitsgründen nicht. Ob eine Bestellung bekannt ist, sagen wir nicht; bei Treffer kommt eine Mail (auch Spam prüfen).",
      sources,
    );
    suggestedActions.push({ label: "Ticket vergessen", href: "/hilfe/ticket-vergessen" });
  } else if (intent === "seating") {
    const wantsBest =
      normalizedMessage.includes("bestplatz") || normalizedMessage.includes("automatisch");
    const wantsFree =
      normalizedMessage.includes("freie platzwahl") ||
      normalizedMessage.includes("stehplatz") ||
      normalizedMessage.includes("nummeriert");
    const slug = wantsBest ? "bestplatz" : wantsFree ? "freie-platzwahl" : "saalplan";
    answer = await answerFromArticle(
      organizationId,
      slug,
      FALLBACKS.seating.answer,
      sources,
    );
    suggestedActions.push(...FALLBACKS.seating.actions);
  } else if (intent === "fees") {
    answer = await answerFromArticle(
      organizationId,
      "verwaltungsgebuehr",
      FALLBACKS.fees.answer,
      sources,
    );
    suggestedActions.push(...FALLBACKS.fees.actions);
  } else if (intent === "digital_tickets") {
    answer = await answerFromArticle(
      organizationId,
      "digitale-tickets",
      FALLBACKS.digital_tickets.answer,
      sources,
    );
    suggestedActions.push(...FALLBACKS.digital_tickets.actions);
  } else if (intent === "cart_hold") {
    answer = await answerFromArticle(
      organizationId,
      "warenkorb-reservierung",
      FALLBACKS.cart_hold.answer,
      sources,
    );
    suggestedActions.push(...FALLBACKS.cart_hold.actions);
  } else if (intent === "invoice") {
    answer = await answerFromArticle(
      organizationId,
      "rechnung",
      FALLBACKS.invoice.answer,
      sources,
    );
    suggestedActions.push(...FALLBACKS.invoice.actions);
  } else if (intent === "handoff_human") {
    answer =
      "Gerne — nutze das Kontaktformular. Ich selbst kann keine Erstattungen, Entwertungen oder Ticketänderungen ausführen.";
    suggestedActions.push({ label: "Anfrage senden", href: "/hilfe#kontakt" });
    await prisma.supportChatSession.update({
      where: { id: session.id },
      data: { status: "handed_off" },
    });
  } else if (intent === "refund_info") {
    answer = await answerFromArticle(
      organizationId,
      "erstattung",
      "Erstattungen richten sich nach AGB und Eventbedingungen. Der Bot storniert nicht — bitte Kundenservice.",
      sources,
    );
    suggestedActions.push(
      { label: "Rückerstattung", href: "/recht/rueckerstattung" },
      { label: "Kundenservice", href: "/hilfe#kontakt" },
    );
  } else if (intent === "ticket_prices") {
    const matches = pickEvents(events, input.message, 2);
    if (matches.length === 0) {
      answer = "Gerade sind keine öffentlichen Events mit Preisen sichtbar. Schau unter Events vorbei.";
      suggestedActions.push({ label: "Events", href: "/events" });
    } else {
      answer = matches.map(formatPrices).join("\n\n");
      answer +=
        "\n\nPreise brutto, zzgl. 4 % Verwaltungsgebühr. Tickets legst du direkt auf der Eventseite in den Warenkorb.";
      for (const event of matches) {
        suggestedActions.push({ label: `Tickets: ${event.name.slice(0, 36)}`, href: `/event/${event.slug}` });
      }
    }
  } else if (intent === "vip_availability") {
    const matches = pickEvents(events, input.message, 3);
    const vipLines: string[] = [];
    for (const event of matches) {
      const vips = findVipCategories(event);
      if (vips.length === 0) {
        vipLines.push(`• ${event.name}: aktuell keine VIP-Kategorie ausgewiesen.`);
        continue;
      }
      for (const vip of vips) {
        const { remaining } = categoryAvailability(vip);
        vipLines.push(
          remaining > 0
            ? `• ${event.name} — ${vip.name}: noch ${remaining} verfügbar à ${formatEuroFromCents(vip.priceGrossCents)}`
            : `• ${event.name} — ${vip.name}: leider ausverkauft`,
        );
        if (remaining > 0) {
          suggestedActions.push({
            label: `VIP: ${event.name.slice(0, 30)}`,
            href: `/event/${event.slug}`,
          });
        }
      }
    }
    if (vipLines.length === 0) {
      answer = "Ich finde gerade keine VIP-Infos. Öffne die Eventübersicht oder frage nach einem konkreten Eventnamen.";
      suggestedActions.push({ label: "Events", href: "/events" });
    } else {
      answer = `VIP-Status:\n${vipLines.join("\n")}\n\nVerfügbarkeit ändert sich live — am besten direkt buchen.`;
    }
  } else if (intent === "artist_events") {
    const artists = await findArtists(organizationId, input.message);
    if (artists.length === 0) {
      // maybe they asked generically "wer ist dabei" about an event
      const matches = pickEvents(events, input.message, 2);
      if (matches.length > 0 && eventArtistLinks(matches[0]).length > 0) {
        const event = matches[0];
        const links = eventArtistLinks(event);
        const names = links.map((a) => a.artist.name).join(", ");
        answer = `Beim Event „${event.name}“ sind u. a. dabei: ${names}.`;
        suggestedActions.push({ label: "Event öffnen", href: `/event/${event.slug}` });
        for (const link of links.slice(0, 3)) {
          suggestedActions.push({
            label: link.artist.name,
            href: `/kuenstler/${link.artist.slug}`,
          });
        }
      } else {
        answer =
          "Nenne gerne den Künstlernamen (z. B. „Bei welchen Events ist Anni Perka dabei?“), dann suche ich die Termine.";
        suggestedActions.push({ label: "Events", href: "/events" });
      }
    } else {
      const blocks: string[] = [];
      for (const artist of artists) {
        const [directLinks, tourLinks] = await Promise.all([
          prisma.eventArtist.findMany({
            where: {
              artistId: artist.id,
              cancelled: false,
              event: {
                organizationId,
                status: { in: [...PUBLIC_STATUSES] },
                OR: [{ tourId: null }, { artistsUseTourDefaults: false }],
              },
            },
            include: {
              event: { include: { location: true } },
            },
            orderBy: { event: { eventStartsAt: "asc" } },
          }),
          prisma.tourArtist.findMany({
            where: {
              artistId: artist.id,
              cancelled: false,
              tour: { organizationId },
            },
            include: {
              tour: {
                include: {
                  events: {
                    where: {
                      organizationId,
                      status: { in: [...PUBLIC_STATUSES] },
                      artistsUseTourDefaults: true,
                    },
                    include: { location: true },
                    orderBy: { eventStartsAt: "asc" },
                  },
                },
              },
            },
          }),
        ]);
        const eventsById = new Map<
          string,
          | (typeof directLinks)[number]["event"]
          | (typeof tourLinks)[number]["tour"]["events"][number]
        >();
        for (const link of directLinks) {
          eventsById.set(link.event.id, link.event);
        }
        for (const link of tourLinks) {
          for (const event of link.tour.events) {
            if (!eventsById.has(event.id)) eventsById.set(event.id, event);
          }
        }
        const linkedEvents = [...eventsById.values()].sort((a, b) => {
          const at = a.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
          const bt = b.eventStartsAt?.getTime() ?? Number.POSITIVE_INFINITY;
          return at - bt;
        });
        if (linkedEvents.length === 0) {
          blocks.push(`Zu ${artist.name} sind gerade keine öffentlichen Termine hinterlegt.`);
        } else {
          const lines = linkedEvents.map((event) => {
            const when = event.eventStartsAt
              ? event.eventStartsAt.toLocaleString("de-DE", {
                  timeZone: "Europe/Berlin",
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "Termin folgt";
            const where = event.location?.name ?? "Ort folgt";
            return `• ${event.name} — ${when} · ${where}`;
          });
          blocks.push(`${artist.name} ist dabei bei:\n${lines.join("\n")}`);
          suggestedActions.push({ label: artist.name, href: `/kuenstler/${artist.slug}` });
          for (const event of linkedEvents.slice(0, 2)) {
            suggestedActions.push({
              label: event.name.slice(0, 40),
              href: `/event/${event.slug}`,
            });
          }
        }
      }
      answer = blocks.join("\n\n");
    }
  } else if (intent === "event_info") {
    const matches = pickEvents(events, input.message, 3);
    if (matches.length === 1) {
      const event = matches[0];
      const when = event.eventStartsAt
        ? event.eventStartsAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })
        : "Termin folgt";
      const where = event.location
        ? `${event.location.name}${event.location.city ? `, ${event.location.city}` : ""}`
        : "Location folgt";
      const doors = event.doorsOpenAt
        ? event.doorsOpenAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })
        : "siehe Eventseite";
      const names = eventArtistNames(event);
      const lineup = names.length > 0 ? `\nLine-up: ${names.join(", ")}` : "";
      const priceHint =
        event.ticketCategories.length > 0
          ? `\nTickets ab ${formatEuroFromCents(Math.min(...event.ticketCategories.map((c) => c.priceGrossCents)))}`
          : "";
      answer = `„${event.name}“\nBeginn ${when}\nOrt ${where}\nEinlass ${doors}${lineup}${priceHint}`;
      suggestedActions.push({ label: "Event & Tickets", href: `/event/${event.slug}` });
    } else if (matches.length > 1) {
      answer =
        "Passende Events:\n\n" +
        matches
          .map((event) => {
            const when = event.eventStartsAt
              ? event.eventStartsAt.toLocaleString("de-DE", {
                  timeZone: "Europe/Berlin",
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "Termin folgt";
            return `• ${event.name} — ${when}`;
          })
          .join("\n");
      for (const event of matches) {
        suggestedActions.push({ label: event.name.slice(0, 42), href: `/event/${event.slug}` });
      }
    } else {
      answer = "Aktuell keine öffentlichen Eventzeiten. Schau auf die Eventübersicht.";
      suggestedActions.push({ label: "Events", href: "/events" });
    }
  } else if (intent in FALLBACKS) {
    const fb = FALLBACKS[intent];
    if (intent === "payment") {
      answer = await answerFromArticle(organizationId, "zahlung", fb.answer, sources);
      if (normalizedMessage.includes("paypal")) {
        answer =
          "PayPal bieten wir nicht an. Du kannst mit Lastschrift (SEPA), Karte, Apple Pay, Google Pay oder Klarna bezahlen — je nach Gerät und Event.\n\n" +
          answer;
      }
    } else if (intent === "my_tickets") {
      answer = await answerFromArticle(organizationId, "meine-tickets", fb.answer, sources);
    } else if (intent === "order_howto") {
      answer = await answerFromArticle(
        organizationId,
        "wie-funktioniert-der-kauf",
        fb.answer,
        sources,
      );
    } else if (intent === "account") {
      answer = await answerFromArticle(organizationId, "gastkauf-konto", fb.answer, sources);
    } else {
      answer = fb.answer;
    }
    suggestedActions.push(...fb.actions);
  } else {
    // creative fallback: try artist then event then knowledge
    const artists = await findArtists(organizationId, input.message);
    if (artists.length > 0) {
      const artist = artists[0];
      answer = `Meinst du ${artist.name}? Frag z. B. „Bei welchen Events ist ${artist.name} dabei?“ oder „Was kosten Tickets für …“.`;
      suggestedActions.push({ label: artist.name, href: `/kuenstler/${artist.slug}` });
      suggestedActions.push({ label: "Events", href: "/events" });
    } else {
      const knowledge = await searchKnowledge(organizationId, input.message);
      if (knowledge.length > 0) {
        answer = knowledge[0].body;
        sources.push({ title: knowledge[0].title, slug: knowledge[0].slug });
      } else {
        answer =
          "Ich helfe bei konkreten Fragen — z. B.:\n• „Was kosten Tickets für die Schlagernacht?“\n• „Gibt’s noch VIP?“\n• „Wie funktioniert Bestplatzbuchung?“\n• „Was ist die Verwaltungsgebühr?“\n• „Ticket vergessen“ / Zahlung / Saalplan";
      }
      suggestedActions.push(
        { label: "Events", href: "/events" },
        { label: "Hilfe", href: "/hilfe" },
        { label: "Ticket vergessen", href: "/hilfe/ticket-vergessen" },
      );
    }
  }

  if (intent === "refund_info" || /storn|refund|entwert/i.test(input.message)) {
    answer +=
      "\n\nHinweis: Der Assistent führt keine Erstattungen, Entwertungen oder Sitzplatzänderungen durch.";
  } else if (intent === "event_info" && /einlass|qr/i.test(input.message)) {
    const einlass = await articleBySlug(organizationId, "einlass");
    if (einlass && !sources.some((s) => s.slug === "einlass")) {
      answer += `\n\n${einlass.body}`;
      sources.push({ title: einlass.title, slug: einlass.slug });
    }
  }

  await prisma.supportChatMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: answer,
      intent,
      sources,
    },
  });

  const uniqueActions = [
    ...new Map(suggestedActions.map((a) => [`${a.href}|${a.label}`, a])).values(),
  ];

  return {
    sessionId: session.id,
    intent,
    answer,
    suggestedActions: uniqueActions.slice(0, 6),
    sources,
  };
}

export async function createSupportHandoff(input: {
  email: string;
  subject: string;
  body: string;
  organizationId?: string;
}) {
  const organizationId =
    input.organizationId ?? (await findDefaultOrganizationId());
  if (!organizationId) throw new Error("NO_ORGANIZATION");

  const request = await prisma.supportRequest.create({
    data: {
      organizationId,
      email: input.email.toLowerCase().trim(),
      subject: input.subject,
      body: input.body,
      status: "open",
      source: "help_form",
    },
  });

  await writeAudit({
    organizationId,
    action: "support.request.created",
    entityType: "support_request",
    entityId: request.id,
    after: { email: request.email, subject: request.subject },
  });

  return request;
}
