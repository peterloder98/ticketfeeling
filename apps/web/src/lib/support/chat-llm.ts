/**
 * Optional LLM polish for support chat answers.
 * Only runs when OPENAI_API_KEY is set; never invents facts — rewrites the draft.
 */

const SYSTEM_PROMPT = `Du bist der Ticketfeeling-Hilfe-Assistent (deutsch, Du-Form).

Stimme: warm, klar, menschlich — wie „Geschafft! Deine Tickets sind da.“ Kein Behördendeutsch, keine Emoji-Spam, keine Marketing-Floskeln.

Regeln:
1. Antworte NUR auf Basis der gelieferten Fakten (FAQ, Events, Künstler, Entwurf). Erfinde keine Termine, Preise, Locations oder Verfügbarkeiten.
2. Bleib bei Ticketfeeling-Themen (Events, Kauf, Zahlung, Tickets/QR/PDF, Konto, Ticket vergessen, Gebühren, Rabatte hochlevel). Bei Off-Topic höflich zurücklenken.
3. Kurz und konkret (meist 2–6 Sätze oder knappe Aufzählung). Bei Unsicherheit: sagen, wo man es auf der Website findet, und Kundenservice anbieten.
4. Du darfst KEINE Erstattungen, Entwertungen, Sitzplatzänderungen oder Bestelländerungen ausführen — nur erklären und verlinken.
5. Kein PayPal behaupten. Zahlungsarten nur wie in den Fakten.
6. Antworte auf Deutsch.`;

export type LlmPolishInput = {
  userMessage: string;
  history: { role: string; content: string }[];
  groundedFacts: string;
  draftAnswer: string;
  intent: string;
};

export function isSupportLlmEnabled() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function polishSupportAnswerWithLlm(
  input: LlmPolishInput,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_SUPPORT_MODEL?.trim() || "gpt-4o-mini";
  const historySlice = input.history.slice(-6).map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content.slice(0, 1200),
  }));

  const userBlock = [
    `Intent: ${input.intent}`,
    "",
    "Fakten (einzige erlaubte Quelle):",
    input.groundedFacts.slice(0, 6000) || "(keine Extra-Fakten)",
    "",
    "Entwurf (inhaltlich bindend, nur stilistisch glätten):",
    input.draftAnswer.slice(0, 3500),
    "",
    `Aktuelle Nutzerfrage: ${input.userMessage.slice(0, 1500)}`,
  ].join("\n");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...historySlice,
          { role: "user", content: userBlock },
        ],
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text || text.length < 8) return null;
    return text.slice(0, 4000);
  } catch {
    return null;
  }
}
