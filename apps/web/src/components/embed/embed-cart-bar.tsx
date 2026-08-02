"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart-context";

/**
 * Always-visible cart control in the embed header.
 * Links stay on /embed/* so navigation never leaves the iframe.
 */
export function EmbedCartBar() {
  const pathname = usePathname() ?? "";
  const { itemCount, grossFormatted, loading } = useCart();
  const onCartPage = pathname.startsWith("/embed/warenkorb");
  const onCheckoutFlow =
    pathname.startsWith("/embed/checkout") || pathname.startsWith("/embed/bestellung");

  const countLabel = loading && itemCount <= 0 ? "…" : String(itemCount);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Link
        href="/embed/warenkorb"
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
          onCartPage
            ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.12)] text-[var(--tf-navy)]"
            : "border-[#e2e8f0] bg-white text-[var(--tf-navy)] hover:border-[var(--tf-teal)]"
        }`}
        aria-label={`Warenkorb${itemCount > 0 ? `, ${itemCount} Tickets` : ""}`}
      >
        <ShoppingCart className="h-3.5 w-3.5 text-[var(--tf-teal)]" aria-hidden />
        <span
          className={`inline-flex min-w-[1.1rem] items-center justify-center rounded-md px-1 text-[11px] tabular-nums ${
            itemCount > 0
              ? "bg-[var(--tf-navy)] font-bold text-white"
              : "bg-[#e2e8f0] font-medium text-[#64748b]"
          }`}
        >
          {countLabel}
        </span>
        <span className="hidden min-[360px]:inline">Warenkorb</span>
      </Link>
      {itemCount > 0 && !onCheckoutFlow ? (
        <Link
          href="/embed/checkout"
          className="tf-btn tf-btn-primary !min-h-8 !rounded-lg !px-2.5 !text-[11px]"
        >
          Kasse
          {grossFormatted ? (
            <span className="ml-1 font-normal opacity-90">{grossFormatted}</span>
          ) : null}
        </Link>
      ) : null}
    </div>
  );
}
