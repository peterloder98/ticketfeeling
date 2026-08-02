"use client";

import { useState } from "react";

export function TicketResendButton({ ticketId }: { ticketId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resend() {
    setLoading(true);
    setMsg(null);
    try {
      const response = await fetch(`/api/v1/account/tickets/${ticketId}/resend`, {
        method: "POST",
      });
      const data = await response.json();
      setMsg(
        response.ok
          ? data.note ?? "Erneut angestoßen"
          : data?.error?.code ?? "Fehler",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="text-sm text-[var(--gold-soft)] underline"
        onClick={resend}
        disabled={loading}
      >
        {loading ? "Sende…" : "Ticket erneut senden"}
      </button>
      {msg ? <p className="text-xs text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}
