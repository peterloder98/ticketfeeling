"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { formatBoxOfficeTicketLines } from "@/lib/commerce/box-office-ticket-label";

export type StornoTicket = {
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

type Mode = "full" | "tickets";

/**
 * Single Storno entry: choose full order or individual tickets with clear seat labels.
 */
export function BoxOfficeStornoDialog({
  orderId,
  orderNumber,
  tickets,
  open,
  onClose,
}: {
  orderId: string;
  orderNumber: string;
  tickets: StornoTicket[];
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("full");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTickets = useMemo(
    () => tickets.filter((t) => t.status !== "voided"),
    [tickets],
  );

  useEffect(() => {
    if (!open) return;
    setMode("full");
    setSelected(new Set());
    setError(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmVoid() {
    if (mode === "tickets" && selected.size === 0) {
      setError("Bitte mindestens ein Ticket wählen.");
      return;
    }
    const ticketIds =
      mode === "full" ? undefined : [...selected];
    const confirmText =
      mode === "full"
        ? `Gesamten Vorgang ${orderNumber} stornieren? Alle Tickets werden entwertet.`
        : `${selected.size} Ticket(s) stornieren? QR entwertet, Plätze wieder frei.`;
    if (!confirm(confirmText)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/box-office/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ticketIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(voidErrorMessage(data?.error?.code));
        return;
      }
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(15,39,71,0.45)] p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--tf-line)] bg-white shadow-[0_20px_50px_rgba(15,39,71,0.25)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--tf-line)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-[var(--tf-navy)]">
              Storno
            </h2>
            <p className="mt-0.5 text-sm text-[var(--tf-text-secondary)]">
              Beleg {orderNumber} — ganzen Vorgang oder einzelne Tickets.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[var(--tf-text-secondary)] hover:bg-[rgba(15,39,71,0.06)] hover:text-[var(--tf-navy)]"
            aria-label="Schließen"
            disabled={busy}
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">Storno-Art</legend>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 ${
                mode === "full"
                  ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
                  : "border-[var(--tf-line)]"
              }`}
            >
              <input
                type="radio"
                name="storno-mode"
                className="mt-1"
                checked={mode === "full"}
                onChange={() => setMode("full")}
                disabled={busy}
              />
              <span>
                <span className="block font-medium text-[var(--tf-navy)]">
                  Gesamter Vorgang
                </span>
                <span className="mt-0.5 block text-sm text-[var(--tf-text-secondary)]">
                  Alle {activeTickets.length} Ticket
                  {activeTickets.length === 1 ? "" : "s"} entwerten und Beleg
                  stornieren.
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 ${
                mode === "tickets"
                  ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
                  : "border-[var(--tf-line)]"
              } ${activeTickets.length === 0 ? "opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="storno-mode"
                className="mt-1"
                checked={mode === "tickets"}
                onChange={() => setMode("tickets")}
                disabled={busy || activeTickets.length === 0}
              />
              <span>
                <span className="block font-medium text-[var(--tf-navy)]">
                  Einzelne Tickets
                </span>
                <span className="mt-0.5 block text-sm text-[var(--tf-text-secondary)]">
                  Nur ausgewählte Karten — mit Platz und Ticketnummer.
                </span>
              </span>
            </label>
          </fieldset>

          {mode === "tickets" ? (
            <ul className="divide-y divide-[var(--tf-line)] rounded-xl border border-[var(--tf-line)]">
              {activeTickets.map((t) => {
                const lines = formatBoxOfficeTicketLines(t);
                const checkedIn = t.presence === "in";
                return (
                  <li key={t.id}>
                    <label
                      className={`flex items-start gap-3 px-3 py-3 text-sm ${
                        checkedIn ? "opacity-50" : "cursor-pointer"
                      }`}
                    >
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
                  </li>
                );
              })}
              {activeTickets.length === 0 ? (
                <li className="px-3 py-4 text-sm text-[var(--tf-text-secondary)]">
                  Keine stornierbaren Tickets.
                </li>
              ) : null}
            </ul>
          ) : null}

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--tf-line)] px-5 py-4">
          <button
            type="button"
            className="tf-btn tf-btn-secondary !min-h-10 flex-1 text-sm"
            disabled={busy}
            onClick={onClose}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="tf-btn !min-h-10 flex-1 border border-[rgba(220,38,38,0.35)] text-sm text-[var(--danger)]"
            disabled={
              busy ||
              (mode === "tickets" && selected.size === 0) ||
              activeTickets.length === 0
            }
            onClick={() => void confirmVoid()}
          >
            {busy
              ? "…"
              : mode === "full"
                ? "Vorgang stornieren"
                : `${selected.size || ""} Ticket${selected.size === 1 ? "" : "s"} stornieren`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
