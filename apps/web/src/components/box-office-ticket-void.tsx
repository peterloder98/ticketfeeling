"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBoxOfficeTicketLines } from "@/lib/commerce/box-office-ticket-label";

export type VoidableTicket = {
  id: string;
  ticketNumber: string;
  categorySnapshot: string;
  status: string;
  presence: string;
  seatLabel?: string | null;
  seatRow?: string | null;
  seatNumber?: string | null;
  blockLabel?: string | null;
};

function voidErrorMessage(code: string | undefined) {
  switch (code) {
    case "DELIVERED_NEEDS_ADMIN":
      return "Bereits gedruckt/versendet — nur Admin kann stornieren.";
    case "CHECKED_IN":
      return "Eingecheckte Tickets können nicht storniert werden.";
    case "TICKET_ALREADY_VOIDED":
      return "Ticket ist bereits storniert.";
    case "ALREADY_VOIDED":
      return "Vorgang ist bereits vollständig storniert.";
    case "FORBIDDEN":
      return "Keine Berechtigung.";
    default:
      return code ?? "Storno fehlgeschlagen";
  }
}

/**
 * Partial / per-ticket storno for box-office packages (e.g. 20–30 cards).
 */
export function BoxOfficeTicketVoidPanel({
  orderId,
  tickets,
  voided,
  compact,
}: {
  orderId: string;
  tickets: VoidableTicket[];
  voided: boolean;
  /** Tighter layout for admin order page */
  compact?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeTickets = useMemo(
    () => tickets.filter((t) => t.status !== "voided"),
    [tickets],
  );
  const voidedTickets = useMemo(
    () => tickets.filter((t) => t.status === "voided"),
    [tickets],
  );

  if (voided || activeTickets.length === 0) {
    if (voidedTickets.length === 0) return null;
    return (
      <div
        className={
          compact
            ? "space-y-2"
            : "rounded-2xl border border-[var(--tf-line)] bg-white p-5 space-y-2"
        }
      >
        <h3 className="text-sm font-semibold text-[var(--tf-navy)]">Tickets</h3>
        <ul className="space-y-1 text-sm text-[var(--tf-text-secondary)]">
          {voidedTickets.map((t) => {
            const lines = formatBoxOfficeTicketLines(t);
            return (
              <li key={t.id} className="line-through">
                <span className="font-medium">{lines.title}</span>
                <span className="block text-xs">
                  {lines.detail} — storniert
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(activeTickets.filter((t) => t.presence !== "in").map((t) => t.id)));
  }

  async function voidSelected() {
    const ids = [...selected];
    if (ids.length === 0) {
      setError("Bitte mindestens ein Ticket wählen.");
      return;
    }
    const all = ids.length >= activeTickets.length;
    if (
      !confirm(
        all
          ? "Alle verbleibenden Tickets stornieren? Der Vorgang wird dann vollständig storniert."
          : `${ids.length} Ticket(s) stornieren? QR entwertet, Plätze wieder frei.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/box-office/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ticketIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(voidErrorMessage(data?.error?.code));
        return;
      }
      setSelected(new Set());
      setMessage(
        data.orderCancelled
          ? "Alle Tickets storniert — Vorgang abgeschlossen."
          : `${data.voidedTicketIds?.length ?? ids.length} Ticket(s) storniert.`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function voidOne(ticketId: string) {
    if (
      !confirm(
        activeTickets.length <= 1
          ? "Letztes Ticket stornieren? Der Vorgang wird dann vollständig storniert."
          : "Dieses Ticket stornieren?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/box-office/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ticketIds: [ticketId] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(voidErrorMessage(data?.error?.code));
        return;
      }
      setMessage(
        data.orderCancelled
          ? "Ticket storniert — Vorgang vollständig storniert."
          : "Ticket storniert.",
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        compact
          ? "space-y-3"
          : "rounded-2xl border border-[var(--tf-line)] bg-white p-5 space-y-3"
      }
    >
      <div>
        <h3 className="text-lg font-semibold text-[var(--tf-navy)]">
          Einzelne Tickets stornieren
        </h3>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Bei Saalplan: Block, Reihe und Platz stehen oben — darunter Ticketnummer und Kategorie.
        </p>
      </div>

      <ul className="divide-y divide-[var(--tf-line)] rounded-xl border border-[var(--tf-line)]">
        {activeTickets.map((t) => {
          const checkedIn = t.presence === "in";
          const lines = formatBoxOfficeTicketLines(t);
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
            >
              <label className="flex min-w-0 flex-1 items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(t.id)}
                  disabled={busy || checkedIn}
                  onChange={() => toggle(t.id)}
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--tf-navy)]">
                    {lines.title}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-[var(--tf-text-secondary)]">
                    {lines.detail}
                    {checkedIn ? " · eingecheckt" : ""}
                  </span>
                </span>
              </label>
              <button
                type="button"
                className="text-sm text-[var(--danger)] underline-offset-2 hover:underline disabled:opacity-40"
                disabled={busy || checkedIn}
                onClick={() => void voidOne(t.id)}
                title={checkedIn ? "Eingecheckt — kein Storno" : "Ticket stornieren"}
              >
                Stornieren
              </button>
            </li>
          );
        })}
      </ul>

      {voidedTickets.length > 0 ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">
          Bereits storniert: {voidedTickets.length}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="tf-btn tf-btn-secondary !min-h-10 text-sm"
          disabled={busy}
          onClick={selectAll}
        >
          Alle wählbaren markieren
        </button>
        <button
          type="button"
          className="tf-btn !min-h-10 border border-[rgba(220,38,38,0.35)] text-sm text-[var(--danger)]"
          disabled={busy || selected.size === 0}
          onClick={() => void voidSelected()}
        >
          {busy
            ? "…"
            : selected.size > 0
              ? `${selected.size} stornieren`
              : "Auswahl stornieren"}
        </button>
      </div>

      {message ? <p className="text-sm text-[var(--tf-teal)]">{message}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
