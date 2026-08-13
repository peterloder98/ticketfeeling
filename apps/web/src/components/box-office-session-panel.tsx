"use client";

import { useEffect, useState } from "react";
import { formatEuroFromCents } from "@/lib/money";
import { formatDeDateTime } from "@/lib/datetime-de";

type Session = {
  id: string;
  openingCashCents: number;
  openedAt: string;
  status: string;
};

export function BoxOfficeSessionPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [cashToday, setCashToday] = useState(0);
  const [opening, setOpening] = useState("0");
  const [closing, setClosing] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/v1/box-office/sessions");
    const data = await res.json();
    if (res.ok) {
      setSession(data.openSession);
      setCashToday(data.cashSalesTodayCents ?? 0);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function openSession() {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/v1/box-office/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingCashEuros: Number(opening.replace(",", ".")) || 0 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error?.code ?? "Fehler");
      return;
    }
    setMessage("Kasse geöffnet");
    await refresh();
  }

  async function closeSession() {
    if (!session) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/v1/box-office/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        closingCashEuros: Number(closing.replace(",", ".")) || 0,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error?.code ?? "Fehler");
      return;
    }
    const diff = data.session?.differenceCents ?? 0;
    setMessage(
      `Kasse geschlossen. Differenz: ${formatEuroFromCents(diff)} (Soll ${formatEuroFromCents(
        data.session?.expectedCashCents ?? 0,
      )})`,
    );
    await refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      <p>
        Bar-Umsatz heute: <strong>{formatEuroFromCents(cashToday)}</strong>
      </p>
      {session ? (
        <div className="space-y-2">
          <p className="text-[var(--ok)]">
            Schicht offen seit {formatDeDateTime(new Date(session.openedAt))} ·
            Anfang {formatEuroFromCents(session.openingCashCents)}
          </p>
          <label className="grid gap-1">
            <span>Endbestand Bar (€)</span>
            <input className="tf-input" value={closing} onChange={(e) => setClosing(e.target.value)} />
          </label>
          <button type="button" className="tf-btn tf-btn-secondary" onClick={() => void closeSession()}>
            Schicht schließen
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="grid gap-1">
            <span>Anfangsbestand Bar (€)</span>
            <input className="tf-input" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </label>
          <button type="button" className="tf-btn tf-btn-primary" onClick={() => void openSession()}>
            Schicht öffnen
          </button>
        </div>
      )}
      {error ? <p className="text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-[var(--gold-soft)]">{message}</p> : null}
    </div>
  );
}
