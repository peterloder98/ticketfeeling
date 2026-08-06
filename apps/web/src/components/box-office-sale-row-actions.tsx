"use client";

import { useState } from "react";
import {
  BoxOfficeStornoDialog,
  type StornoTicket,
} from "@/components/box-office-storno-dialog";

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
