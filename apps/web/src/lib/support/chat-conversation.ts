/**
 * Conversational layer for the support chat: greetings, follow-ups,
 * soft intent detection, and natural German phrasing over grounded facts.
 */

export type ChatHistoryItem = {
  role: string;
  content: string;
  intent: string | null;
};

const FOLLOW_UP_RE =
  /^(und|dazu|nochmal|noch mal|mehr|ja|ok|okay|klar|bitte|genau|stimmt|richtig|und die|und das|und wo|und wann|und was|was kostet|was kosten|gibt.?s noch|gibt es noch|preise\??|vip\??|line[- ]?up\??|kuenstler\??|künstler\??)$/i;

const GREETING_RE =
  /^(hallo|hi|hey|moin|guten\s*(tag|morgen|abend)|servus|grue?ß\s*gott|na\??|yo)\b/i;

const THANKS_RE =
  /\b(danke|dankeschön|dankesehr|vielen dank|super dank|perfekt|klasse|toll|genial)\b/i;

const BYE_RE = /\b(tsch[uü]ss|ciao|bye|auf wiedersehen|bis dann|schönen tag)\b/i;

const HELP_MENU_RE =
  /\b(was kannst du|womit kannst du|hilfe|hilfst du|welche themen|worüber|was wei(ss|ß)t du)\b/i;

export function normalizeChatText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function isMostlySmallTalk(message: string): boolean {
  const m = normalizeChatText(message);
  if (m.length < 2) return true;
  if (GREETING_RE.test(m) && m.split(/\s+/).length <= 4) return true;
  if (THANKS_RE.test(m) && m.split(/\s+/).length <= 6) return true;
  if (BYE_RE.test(m) && m.split(/\s+/).length <= 5) return true;
  if (HELP_MENU_RE.test(m)) return true;
  return false;
}

export function detectConversationalIntent(message: string): string | null {
  const m = normalizeChatText(message);
  if (!m) return "greeting";
  if (HELP_MENU_RE.test(m)) return "help_menu";
  if (BYE_RE.test(m) && m.split(/\s+/).length <= 5) return "goodbye";
  if (THANKS_RE.test(m) && m.split(/\s+/).length <= 6) return "thanks";
  if (GREETING_RE.test(m) && m.split(/\s+/).length <= 4) return "greeting";
  if (
    m.includes("rabatt") ||
    m.includes("aktion") ||
    m.includes("gutschein") ||
    m.includes("promo") ||
    (m.includes("code") && (m.includes("rabatt") || m.includes("gutschein") || m.includes("einlos"))) ||
    (m.includes("sparen") && (m.includes("ticket") || m.includes("preis") || m.includes("euro")))
  ) {
    return "discounts";
  }
  return null;
}

/** Short replies that continue the previous topic. */
export function isFollowUpMessage(message: string): boolean {
  const m = normalizeChatText(message);
  if (m.length <= 48 && FOLLOW_UP_RE.test(m)) return true;
  if (
    m.length <= 40 &&
    /^(und |was |wo |wann |wie |gibt|noch |dazu)/.test(m) &&
    !/\b(ticket vergessen|erstatt|storno|paypal|sepa)\b/.test(m)
  ) {
    return true;
  }
  return false;
}

const FACT_INTENTS = new Set([
  "forgotten_ticket",
  "fees",
  "seating",
  "digital_tickets",
  "cart_hold",
  "invoice",
  "vip_availability",
  "ticket_prices",
  "artist_events",
  "my_tickets",
  "payment",
  "order_howto",
  "refund_info",
  "event_info",
  "account",
  "discounts",
]);

export function lastFactIntent(history: ChatHistoryItem[]): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item.role === "assistant" && item.intent && FACT_INTENTS.has(item.intent)) {
      return item.intent;
    }
  }
  return null;
}

/** Previous user question that carried event/artist names for scoring. */
export function lastUserFactMessage(history: ChatHistoryItem[]): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item.role !== "user") continue;
    if (item.intent && (FACT_INTENTS.has(item.intent) || item.intent === "faq_general")) {
      return item.content;
    }
  }
  return null;
}

export function resolveFollowUpIntent(
  message: string,
  history: ChatHistoryItem[],
): { intent: string; scoringMessage: string } | null {
  if (!isFollowUpMessage(message)) return null;
  const prior = lastFactIntent(history);
  if (!prior) return null;

  const m = normalizeChatText(message);
  let intent = prior;
  if (/\b(preis|preise|kostet|kosten|teuer|euro)\b/.test(m)) intent = "ticket_prices";
  else if (/\bvip\b/.test(m)) intent = "vip_availability";
  else if (/\b(wann|wo|ort|location|termin|einlass)\b/.test(m)) intent = "event_info";
  else if (/\b(kuenstler|kunstler|line[- ]?up|dabei|artist)\b/.test(m)) intent = "artist_events";
  else if (/\b(zahl|bezahlen|sepa|karte)\b/.test(m)) intent = "payment";
  else if (/\b(gebuhr|gebuehr|verwaltungs)\b/.test(m)) intent = "fees";
  else if (/\b(rabatt|aktion|gutschein)\b/.test(m)) intent = "discounts";

  const priorUser = lastUserFactMessage(history) ?? "";
  const scoringMessage = `${priorUser} ${message}`.trim();
  return { intent, scoringMessage };
}

export function conversationalLead(intent: string): string {
  switch (intent) {
    case "greeting":
      return "";
    case "thanks":
      return "";
    case "goodbye":
      return "";
    case "help_menu":
      return "";
    case "order_howto":
      return "Klar — so bestellst du bei Ticketfeeling:";
    case "payment":
      return "Zur Zahlung kurz und klar:";
    case "my_tickets":
      return "Deine Tickets findest du so:";
    case "forgotten_ticket":
      return "Kein Stress — so holst du sie wieder:";
    case "fees":
      return "Zur Verwaltungsgebühr:";
    case "digital_tickets":
      return "Tickets bei uns sind digital:";
    case "seating":
      return "Zur Platzwahl:";
    case "cart_hold":
      return "Zur Reservierung im Warenkorb:";
    case "invoice":
      return "Zur Rechnung:";
    case "account":
      return "Gastkauf oder Konto — beides geht:";
    case "refund_info":
      return "Zu Storno und Erstattung:";
    case "discounts":
      return "Zu Rabatten und Aktionen:";
    case "ticket_prices":
      return "Aktuelle Preise aus dem System:";
    case "vip_availability":
      return "Zum VIP-Status:";
    case "artist_events":
      return "Dazu habe ich im Programm:";
    case "event_info":
      return "Hier die Infos aus dem Programm:";
    default:
      return "Dazu kann ich dir das sagen:";
  }
}

export function wrapConversationalAnswer(intent: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return trimmed;
  const lead = conversationalLead(intent);
  if (!lead) return trimmed;
  // Avoid double lead-ins if article already starts conversationally
  if (trimmed.toLowerCase().startsWith(lead.toLowerCase().slice(0, 12))) return trimmed;
  return `${lead}\n\n${trimmed}`;
}

export function answerGreeting(): {
  answer: string;
  actions: { label: string; href: string }[];
} {
  return {
    answer:
      "Hallo! Ich bin der Ticketfeeling-Assistent. Frag mich gern zu Events, Künstlern, Ticketkauf, Zahlung, QR-Codes/PDF oder wenn du Tickets nicht findest — ich antworte konkret und leite dich weiter, wenn’s komplizierter wird.",
    actions: [
      { label: "Events", href: "/events" },
      { label: "Hilfe", href: "/hilfe" },
      { label: "Ticket vergessen", href: "/hilfe/ticket-vergessen" },
    ],
  };
}

export function answerThanks(): {
  answer: string;
  actions: { label: string; href: string }[];
} {
  return {
    answer:
      "Gern! Wenn noch was offen ist — Events, Zahlung, Tickets im Konto — einfach weiterschreiben.",
    actions: [
      { label: "Events", href: "/events" },
      { label: "Hilfe", href: "/hilfe" },
    ],
  };
}

export function answerGoodbye(): {
  answer: string;
  actions: { label: string; href: string }[];
} {
  return {
    answer: "Bis bald — und viel Freude beim Event. Bei Fragen bin ich wieder da.",
    actions: [{ label: "Events", href: "/events" }],
  };
}

export function answerHelpMenu(): {
  answer: string;
  actions: { label: string; href: string }[];
} {
  return {
    answer: `Ich helfe dir z. B. bei:

• Events, Terminen und Locations
• Künstlern und Line-up
• Ticketpreisen und VIP
• Bestellablauf und Warenkorb
• Zahlung (SEPA, Karte, Apple/Google Pay, Klarna — kein PayPal)
• QR-Tickets, PDF und Ausdrucken
• Verwaltungsgebühr
• Ticket vergessen / Konto
• Rabatten und Aktionen (hochlevel — Details auf der Eventseite)

Erstattungen oder Ticketänderungen kann ich nicht selbst ausführen — dafür gibt’s den Kundenservice.`,
    actions: [
      { label: "Events", href: "/events" },
      { label: "Hilfe", href: "/hilfe" },
      { label: "Kundenservice", href: "/hilfe#kontakt" },
    ],
  };
}

/** Soft synonym map for FAQ token matching. */
export const KNOWLEDGE_SYNONYMS: Record<string, string[]> = {
  bezahlen: ["zahlung", "sepa", "karte", "klarna"],
  paypal: ["zahlung"],
  qr: ["einlass", "digital", "tickets"],
  pdf: ["digital", "tickets", "meine"],
  drucken: ["digital", "print", "pdf"],
  vergessen: ["tickets-nicht", "vergessen"],
  verloren: ["tickets-nicht", "vergessen"],
  gebuhr: ["verwaltungs", "gebuhr"],
  gebuehr: ["verwaltungs", "gebuhr"],
  sitzplatz: ["saalplan", "bestplatz", "platz"],
  stehplatz: ["freie", "platzwahl"],
  gast: ["gastkauf", "konto"],
  login: ["konto", "anmeld"],
  storno: ["erstattung"],
  widerruf: ["erstattung"],
  rabatt: ["aktion", "gutschein", "code"],
  aktion: ["rabatt", "gutschein"],
};
