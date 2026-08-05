"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye } from "lucide-react";
import {
  BoxOfficeStornoDialog,
  type StornoTicket,
} from "@/components/box-office-storno-dialog";

const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--tf-line)] text-[var(--tf-navy)] transition hover:border-[var(--tf-teal)] hover:text-[var(--tf-teal)]";

/** One open action — print/email live in the Beleg detail view. */
export function BoxOfficeSaleRowActions({ orderId }: { orderId: string }) {
  return (
    <Link
      href={`/kasse/beleg/${orderId}`}
      className={iconBtn}
      title="Beleg öffnen"
      aria-label="Beleg öffnen"
    >
      <Eye className="h-4 w-4" />
    </Link>
  );
}

/** Single Storno control with full-order vs ticket chooser. */
export function BoxOfficeVoidButton({
  orderId,
  orderNumber,
  voided,
  tickets,
}: {
  orderId: string;
  orderNumber: string;
  voided: boolean;
  tickets: StornoTicket[];
  deliveryStatus?: string;
}) {
  const [open, setOpen] = useState(false);

  if (voided) {
    return <span className="text-xs text-[var(--tf-text-secondary)]">—</span>;
  }

  const activeCount = tickets.filter((t) => t.status !== "voided").length;
  if (activeCount === 0) {
    return <span className="text-xs text-[var(--tf-text-secondary)]">—</span>;
  }

  return (
    <>
      <button
        type="button"
        className="tf-btn !min-h-8 !px-2.5 text-xs text-[var(--danger)] border border-[rgba(220,38,38,0.35)] hover:bg-[rgba(220,38,38,0.06)]"
        onClick={() => setOpen(true)}
      >
        Storno
      </button>
      <BoxOfficeStornoDialog
        orderId={orderId}
        orderNumber={orderNumber}
        tickets={tickets}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
