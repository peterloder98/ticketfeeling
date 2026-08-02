"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart-context";

export function CartNavButton({ compact = false }: { compact?: boolean }) {
  const { itemCount } = useCart();
  const label =
    itemCount > 0
      ? `Warenkorb, ${itemCount} ${itemCount === 1 ? "Artikel" : "Artikel"}`
      : "Warenkorb, leer";

  return (
    <Link
      href="/warenkorb"
      aria-label={label}
      title={label}
      className="relative inline-flex shrink-0 items-center gap-1.5 rounded-[14px] px-2.5 py-2 text-sm font-medium text-[var(--tf-navy)] hover:bg-[rgba(20,184,166,0.1)] hover:text-[var(--tf-teal-hover)] md:px-3"
    >
      <span className="relative inline-flex">
        <ShoppingCart className="h-5 w-5 text-[var(--tf-teal)]" strokeWidth={2} />
        <span
          className={`absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${
            itemCount > 0
              ? "bg-[var(--tf-teal)] text-white"
              : "bg-[var(--tf-line)] text-[var(--tf-navy)]"
          }`}
          aria-hidden
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      </span>
      {!compact ? <span className="hidden sm:inline">Warenkorb</span> : null}
    </Link>
  );
}
