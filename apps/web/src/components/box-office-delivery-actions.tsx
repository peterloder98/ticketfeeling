"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BoxOfficeDeliveryActions({
  orderId,
  deliveryStatus,
  customerEmail,
  ticketIds,
  voided,
}: {
  orderId: string;
  deliveryStatus: string;
  customerEmail: string | null;
  ticketIds: string[];
  voided: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(
    customerEmail && !customerEmail.includes("@ticketfeeling.local") ? customerEmail : "",
  );
  const [busy, setBusy] = useState<"print" | "email" | "void" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (voided) {
    return (
      <p className="rounded-xl border border-[var(--danger)]/40 bg-[rgba(226,92,92,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
        Dieser Vorgang ist storniert. Tickets sind entwertet und gelten nicht mehr zum Einlass.
      </p>
    );
  }

  async function markPrinted() {
    setBusy("print");
    setError(null);
    try {
      // One combined PDF (all tickets) — avoids popup blockers blocking 2nd+ tabs
      window.open(`/api/v1/orders/${orderId}/pdf`, "_blank", "noopener,noreferrer");
      const res = await fetch("/api/v1/box-office/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "print" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.code ?? "Druck-Markierung fehlgeschlagen");
        return;
      }
      setMessage(
        ticketIds.length > 1
          ? `${ticketIds.length} Tickets in einer PDF geöffnet.`
          : "Als gedruckt markiert.",
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function sendEmail() {
    setBusy("email");
    setError(null);
    try {
      const res = await fetch("/api/v1/box-office/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          action: "email",
          toEmail: email.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.code ?? "E-Mail fehlgeschlagen");
        return;
      }
      setMessage(`Tickets versendet an ${data.to}.`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function voidSale() {
    if (!confirm("Verkauf wirklich stornieren? Tickets werden entwertet.")) return;
    setBusy("void");
    setError(null);
    try {
      const res = await fetch("/api/v1/box-office/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error?.code === "DELIVERED_NEEDS_ADMIN"
            ? "Bereits gedruckt/versendet — nur Admin kann stornieren."
            : (data?.error?.code ?? "Storno fehlgeschlagen"),
        );
        return;
      }
      setMessage("Storniert.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--tf-line)] bg-white p-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--tf-navy)]">Tickets ausgeben</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Status:{" "}
          {deliveryStatus === "none"
            ? "noch nicht ausgegeben — bitte drucken oder per E-Mail senden"
            : deliveryStatus === "printed"
              ? "gedruckt"
              : deliveryStatus === "emailed"
                ? "per E-Mail"
                : "gedruckt und per E-Mail"}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="tf-btn tf-btn-primary !min-h-12"
          disabled={busy !== null}
          onClick={() => void markPrinted()}
        >
          {busy === "print" ? "…" : "Drucken / PDF"}
        </button>
        <button
          type="button"
          className="tf-btn tf-btn-secondary !min-h-12"
          disabled={busy !== null}
          onClick={() => void sendEmail()}
        >
          {busy === "email" ? "…" : "Per E-Mail senden"}
        </button>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-[var(--tf-navy)]">E-Mail-Adresse</span>
        <input
          type="email"
          className="tf-input"
          placeholder="kunde@beispiel.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <p className="text-xs text-[var(--tf-text-secondary)]">
        Tickets als PDF im Anhang. Erneut senden oder drucken jederzeit möglich.
      </p>

      <button
        type="button"
        className="text-sm text-[var(--danger)] underline-offset-2 hover:underline"
        disabled={busy !== null}
        onClick={() => void voidSale()}
      >
        Verkauf stornieren
      </button>

      {message ? <p className="text-sm text-[var(--tf-teal)]">{message}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
