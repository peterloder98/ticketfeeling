"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, Mail, Printer, X } from "lucide-react";

const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--tf-line)] text-[var(--tf-navy)] transition hover:border-[var(--tf-teal)] hover:text-[var(--tf-teal)] disabled:opacity-50";

export function BoxOfficeVoidButton({
  orderId,
  voided,
  deliveryStatus,
}: {
  orderId: string;
  voided: boolean;
  deliveryStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (voided) {
    return <span className="text-xs text-[var(--tf-text-secondary)]">—</span>;
  }

  async function voidSale() {
    if (!confirm("Verkauf wirklich stornieren?")) return;
    setBusy(true);
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
            ? "Admin nötig"
            : (data?.error?.code ?? "Fehler"),
        );
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.35)] text-[var(--danger)] transition hover:bg-[rgba(220,38,38,0.08)] disabled:opacity-50"
        disabled={busy}
        onClick={() => void voidSale()}
        title={
          deliveryStatus !== "none"
            ? "Bereits ausgegeben — ggf. nur Admin"
            : "Verkauf stornieren"
        }
        aria-label="Verkauf stornieren"
      >
        {busy ? (
          <span className="text-xs">…</span>
        ) : (
          <X className="h-4 w-4" strokeWidth={2.5} />
        )}
      </button>
      {error ? (
        <p className="max-w-[5rem] text-center text-[10px] text-[var(--danger)]">{error}</p>
      ) : null}
    </div>
  );
}

export function BoxOfficeSaleRowActions({
  orderId,
  ticketIds,
  voided,
}: {
  orderId: string;
  ticketIds: string[];
  voided: boolean;
  deliveryStatus?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"print" | null>(null);

  if (voided) {
    return (
      <Link
        href={`/kasse/beleg/${orderId}`}
        className={iconBtn}
        title="Ansehen"
        aria-label="Beleg ansehen"
      >
        <Eye className="h-4 w-4" />
      </Link>
    );
  }

  async function printAgain() {
    setBusy("print");
    try {
      window.open(`/api/v1/orders/${orderId}/pdf`, "_blank", "noopener,noreferrer");
      await fetch("/api/v1/box-office/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "print" }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Link
        href={`/kasse/beleg/${orderId}`}
        className={iconBtn}
        title="Ansehen"
        aria-label="Beleg ansehen"
      >
        <Eye className="h-4 w-4" />
      </Link>
      <button
        type="button"
        className={iconBtn}
        disabled={busy !== null || ticketIds.length === 0}
        onClick={() => void printAgain()}
        title="Drucken"
        aria-label="Tickets drucken"
      >
        {busy === "print" ? (
          <span className="text-xs">…</span>
        ) : (
          <Printer className="h-4 w-4" />
        )}
      </button>
      <Link
        href={`/kasse/beleg/${orderId}#ausgabe`}
        className={iconBtn}
        title="E-Mail"
        aria-label="Per E-Mail senden"
      >
        <Mail className="h-4 w-4" />
      </Link>
    </div>
  );
}
