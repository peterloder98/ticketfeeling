"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MessageCircle, Send, X, Bot } from "lucide-react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SuggestedAction = { label: string; href: string };

const QUICK_PROMPTS = [
  { label: "Welche Events gibt’s?", text: "Welche Events gibt es gerade?" },
  { label: "Ticketpreise?", text: "Was kosten die Tickets?" },
  { label: "Noch VIP?", text: "Gibt es noch VIP Karten?" },
  { label: "Künstler suchen", text: "Bei welchen Events ist Anni Perka dabei?" },
  { label: "Wie bestelle ich?", text: "Wie bestelle ich Tickets?" },
  { label: "Wo sind meine Tickets?", text: "Wo finde ich meine Tickets?" },
  { label: "Ticket vergessen", text: "Ich habe mein Ticket vergessen" },
];

function Avatar() {
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgba(20,184,166,0.15)] ring-2 ring-white">
      <Image
        src="/brand/icon-app-clear.png?v=20260805-tfmark"
        alt=""
        width={36}
        height={36}
        unoptimized
        className="h-7 w-7 object-contain"
      />
    </span>
  );
}

export function ChatWidget({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hallo! Ich bin der Ticketfeeling-Assistent. Frag mich zu Events, Bestellung, Zahlung, Tickets im Konto oder „Ticket vergessen“ — ich helfe, wo ich kann.",
    },
  ]);
  const [actions, setActions] = useState<SuggestedAction[]>([
    { label: "Events", href: "/events" },
    { label: "Ticket vergessen", href: "/hilfe/ticket-vergessen" },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setLoading(true);

    try {
      const response = await fetch("/api/v1/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sessionId,
          channel: compact ? "widget" : "help_page",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Fehler");
      }
      setSessionId(data.sessionId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
      setActions(data.suggestedActions ?? []);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Der Chat ist gerade nicht erreichbar. Nutze „Ticket vergessen“ oder schreib dem Kundenservice auf der Hilfeseite.",
        },
      ]);
      setActions([
        { label: "Ticket vergessen", href: "/hilfe/ticket-vergessen" },
        { label: "Hilfe", href: "/hilfe" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  if (compact && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--tf-navy)] text-white shadow-[0_12px_40px_rgba(15,39,71,0.28)] transition hover:scale-[1.03] md:bottom-6 md:right-6"
        aria-label="Fragen? Wir helfen dir."
        title="Fragen? Wir helfen dir."
      >
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[var(--tf-teal)]">
          <MessageCircle className="h-5 w-5" strokeWidth={2.2} />
          <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--tf-navy)] bg-emerald-400" />
        </span>
      </button>
    );
  }

  return (
    <div
      className={
        compact
          ? "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 z-40 flex h-[min(520px,calc(100vh-9rem))] w-[min(380px,calc(100vw-3rem))] flex-col overflow-hidden rounded-[24px] border border-[var(--tf-line)] bg-white text-[var(--tf-text)] shadow-[0_20px_50px_rgba(15,39,71,0.22)] md:bottom-6 md:right-6"
          : "flex h-[min(640px,70vh)] flex-col overflow-hidden rounded-[24px] border border-[var(--tf-line)] bg-white shadow-[0_12px_40px_rgba(15,39,71,0.1)]"
      }
      role="dialog"
      aria-label="Ticketfeeling Chatbot"
    >
      <div className="flex items-center gap-3 bg-[var(--tf-navy)] px-4 py-3 text-white">
        <Avatar />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            Ticketfeeling Hilfe
            <Bot className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} />
          </p>
          <p className="flex items-center gap-1.5 text-xs text-white/75">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Online · Fragen? Wir helfen dir.
          </p>
        </div>
        {compact ? (
          <button
            type="button"
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => setOpen(false)}
            aria-label="Chat schließen"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[#f1f5f9] px-3 py-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "ml-10 self-end rounded-2xl rounded-br-md bg-[var(--tf-teal)] px-3.5 py-2.5 text-sm font-medium leading-relaxed text-white"
                : "mr-6 flex items-start gap-2 self-start"
            }
          >
            {message.role === "assistant" ? (
              <>
                <Avatar />
                <div className="rounded-2xl rounded-tl-md border border-[var(--tf-line)] bg-white px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-[var(--tf-text)] shadow-sm">
                  {message.content}
                </div>
              </>
            ) : (
              message.content
            )}
          </div>
        ))}
        {loading ? (
          <div className="mr-6 flex items-start gap-2">
            <Avatar />
            <div className="rounded-2xl border border-[var(--tf-line)] bg-white px-4 py-3 shadow-sm">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--tf-teal)] [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--tf-teal)] [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--tf-teal)] [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {!loading && messages.length <= 2 ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--tf-line)] bg-white px-3 py-2.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              onClick={() => void sendMessage(prompt.text)}
              className="rounded-full border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-1.5 text-xs font-medium text-[var(--tf-navy)] hover:border-[var(--tf-teal)] hover:text-[var(--tf-teal-hover)]"
            >
              {prompt.label}
            </button>
          ))}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--tf-line)] bg-white px-3 py-2">
          {actions.map((action) => (
            <Link
              key={action.href + action.label}
              href={action.href}
              className="rounded-full border border-[var(--tf-line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--tf-navy)] hover:border-[var(--tf-teal)] hover:text-[var(--tf-teal-hover)]"
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-[var(--tf-line)] bg-white p-3">
        <input
          className="tf-input !min-h-11 flex-1 !rounded-full !bg-[#f8fafc] !px-4 !text-[var(--tf-text)]"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Nachricht an den Chatbot…"
          aria-label="Nachricht an den Chatbot"
          autoComplete="off"
        />
        <button
          type="submit"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--tf-teal)] text-white hover:bg-[var(--tf-teal-hover)] disabled:opacity-50"
          disabled={loading || !input.trim()}
          aria-label="Senden"
        >
          <Send className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </form>
    </div>
  );
}
