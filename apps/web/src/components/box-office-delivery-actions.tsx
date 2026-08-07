"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BoxOfficeStornoDialog,
  type StornoTicket,
} from "@/components/box-office-storno-dialog";

type DeliveryMode = "print" | "email" | "both";

export function BoxOfficeDeliveryActions({
  orderId,
  orderNumber,
  deliveryStatus,
  customerEmail,
  ticketIds,
  tickets,
  voided,
  preferredDelivery,
  paymentMethod,
  assignedTicketIds,
}: {
  orderId: string;
  orderNumber: string;
  deliveryStatus: string;
  customerEmail: string | null;
  ticketIds: string[];
  tickets: StornoTicket[];
  voided: boolean;
  preferredDelivery?: DeliveryMode | null;
  paymentMethod?: string | null;
  assignedTicketIds?: string[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState(
    customerEmail && !customerEmail.includes("@ticketfeeling.local") ? customerEmail : "",
  );
  const [busy, setBusy] = useState<"print" | "email" | "mark_sold" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stornoOpen, setStornoOpen] = useState(false);
  const [autoDone, setAutoDone] = useState(false);
  const isConsignment = paymentMethod === "consignment";
  const assignedIds = assignedTicketIds ?? [];

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
      if (!email.trim()) {
        setError("E-Mail-Adresse erforderlich");
        return;
      }
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

  async function markSold() {
    setBusy("mark_sold");
    setError(null);
    try {
      const res = await fetch(`/api/v1/box-office/consignments/${orderId}/mark-sold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketIds: assignedIds.length > 0 ? assignedIds : undefined,
          toEmail: email.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.code ?? "Markierung fehlgeschlagen");
        return;
      }
      setMessage(
        `${data.soldCount} Ticket${data.soldCount === 1 ? "" : "s"} als verkauft markiert` +
          (data.emailedTo ? ` · E-Mail an ${data.emailedTo}` : "") +
          " (gleiche Ticketnr./QR).",
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (autoDone || !preferredDelivery || deliveryStatus !== "none") return;
    setAutoDone(true);
    if (preferredDelivery === "print" || preferredDelivery === "both") {
      void markPrinted();
    }
    if (preferredDelivery === "email" || preferredDelivery === "both") {
      if (email.trim()) void sendEmail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot preferred delivery
  }, [preferredDelivery, deliveryStatus, autoDone]);

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--tf-line)] bg-white p-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--tf-navy)]">
          {isConsignment ? "Vorverkaufskontingent" : "Tickets ausgeben"}
        </h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Ausgabe:{" "}
          {deliveryStatus === "none"
            ? "noch nicht gedruckt / gemailt"
            : deliveryStatus === "printed"
              ? "gedruckt"
              : deliveryStatus === "emailed"
                ? "per E-Mail"
                : "gedruckt und per E-Mail"}
          {isConsignment
            ? ` · Bestand: ${assignedIds.length} zugewiesen, noch nicht final verkauft`
            : ""}
        </p>
        <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
          Drucken und E-Mail teilen dieselbe Ticketnr. und denselben QR — kein Doppelverkauf.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          className="tf-btn tf-btn-primary !min-h-12"
          disabled={busy !== null}
          onClick={() => void markPrinted()}
        >
          {busy === "print" ? "…" : "Drucken"}
        </button>
        <button
          type="button"
          className="tf-btn tf-btn-secondary !min-h-12"
          disabled={busy !== null || !email.trim()}
          onClick={() => void sendEmail()}
        >
          {busy === "email" ? "…" : "E-Mail"}
        </button>
        <button
          type="button"
          className="tf-btn tf-btn-secondary !min-h-12"
          disabled={busy !== null || !email.trim()}
          onClick={() => {
            void (async () => {
              await markPrinted();
              await sendEmail();
            })();
          }}
        >
          Drucken + E-Mail
        </button>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-[var(--tf-navy)]">
          E-Mail-Adresse {preferredDelivery === "print" ? "(optional)" : ""}
        </span>
        <input
          type="email"
          className="tf-input"
          placeholder="kunde@beispiel.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <p className="text-xs text-[var(--tf-text-secondary)]">
        Nur Drucken: E-Mail nicht nötig. Bei E-Mail: Tickets als PDF im Anhang.
      </p>

      {isConsignment && assignedIds.length > 0 ? (
        <div className="rounded-xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] p-3 space-y-2">
          <p className="text-sm text-[var(--tf-navy)]">
            Vorgedruckte Tickets vor Ort verkauft? Als verkauft markieren — ohne neue QR/ID.
          </p>
          <button
            type="button"
            className="tf-btn tf-btn-primary !min-h-10 text-sm"
            disabled={busy !== null}
            onClick={() => void markSold()}
          >
            {busy === "mark_sold" ? "…" : `${assignedIds.length} als verkauft markieren`}
          </button>
        </div>
      ) : null}

      <div>
        <button
          type="button"
          className="text-sm text-[var(--danger)] underline-offset-2 hover:underline"
          disabled={busy !== null}
          onClick={() => setStornoOpen(true)}
        >
          Storno…
        </button>
      </div>

      {message ? <p className="text-sm text-[var(--tf-teal)]">{message}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <BoxOfficeStornoDialog
        orderId={orderId}
        orderNumber={orderNumber}
        tickets={tickets}
        open={stornoOpen}
        onClose={() => setStornoOpen(false)}
      />
    </div>
  );
}
