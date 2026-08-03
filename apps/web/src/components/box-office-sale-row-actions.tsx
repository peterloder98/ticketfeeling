"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, Mail, Printer, X } from "lucide-react";

const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--tf-line)] text-[var(--tf-navy)] transition hover:border-[var(--tf-teal)] hover:text-[var(--tf-teal)] disabled:opacity-50";

/** Opens beleg ticket list for per-ticket void (packages of 20–30). */
export function BoxOfficeVoidButton({
  orderId,
  voided,
}: {
  orderId: string;
  voided: boolean;
  deliveryStatus?: string;
}) {
  if (voided) {
    return <span className="text-xs text-[var(--tf-text-secondary)]">—</span>;
  }

  return (
    <Link
      href={`/kasse/beleg/${orderId}#storno`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.35)] text-[var(--danger)] transition hover:bg-[rgba(220,38,38,0.08)]"
      title="Einzelne Tickets stornieren"
      aria-label="Einzelstorno öffnen"
    >
      <X className="h-4 w-4" strokeWidth={2.5} />
    </Link>
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
      <Link
        href={`/kasse/beleg/${orderId}#storno`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(220,38,38,0.35)] text-[var(--danger)] transition hover:bg-[rgba(220,38,38,0.08)]"
        title="Einzelstorno"
        aria-label="Einzelstorno"
      >
        <X className="h-4 w-4" strokeWidth={2.5} />
      </Link>
    </div>
  );
}
