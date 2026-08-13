import { describe, expect, it } from "vitest";
import {
  detectConversationalIntent,
  isFollowUpMessage,
  lastFactIntent,
  resolveFollowUpIntent,
  wrapConversationalAnswer,
  type ChatHistoryItem,
} from "@/lib/support/chat-conversation";

describe("chat-conversation", () => {
  it("detects greetings and thanks", () => {
    expect(detectConversationalIntent("Hallo!")).toBe("greeting");
    expect(detectConversationalIntent("Guten Morgen")).toBe("greeting");
    expect(detectConversationalIntent("Danke dir")).toBe("thanks");
    expect(detectConversationalIntent("Was kannst du?")).toBe("help_menu");
    expect(detectConversationalIntent("Gibt es einen Rabattcode?")).toBe("discounts");
    expect(detectConversationalIntent("Gibt es Aktionen?")).toBe("discounts");
  });

  it("detects follow-ups and inherits prior intent", () => {
    expect(isFollowUpMessage("Und die Preise?")).toBe(true);
    expect(isFollowUpMessage("VIP?")).toBe(true);

    const history: ChatHistoryItem[] = [
      { role: "user", content: "Wann ist die Schlagernacht?", intent: "event_info" },
      {
        role: "assistant",
        content: "Beginn …",
        intent: "event_info",
      },
    ];
    const resolved = resolveFollowUpIntent("Und die Preise?", history);
    expect(resolved?.intent).toBe("ticket_prices");
    expect(resolved?.scoringMessage).toContain("Schlagernacht");
  });

  it("reads last fact intent from history", () => {
    const history: ChatHistoryItem[] = [
      { role: "user", content: "Hallo", intent: "greeting" },
      { role: "assistant", content: "Hi", intent: "greeting" },
      { role: "user", content: "Wie bezahle ich?", intent: "payment" },
      { role: "assistant", content: "SEPA …", intent: "payment" },
    ];
    expect(lastFactIntent(history)).toBe("payment");
  });

  it("wraps answers with a conversational lead", () => {
    const wrapped = wrapConversationalAnswer("fees", "Zum Ticketpreis kommt 4 %.");
    expect(wrapped.startsWith("Zur Verwaltungsgebühr:")).toBe(true);
    expect(wrapped).toContain("4 %");
  });
});
