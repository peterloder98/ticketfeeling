"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart-context";

/** Compact cart strip inside the embed iframe — never breaks out to the host page. */
export function EmbedCartBar() {
  const pathname = usePathname() ?? "";
  const { itemCount, grossFormatted } = useCart();
  if (itemCount <= 0) return null;
  if (
    pathname.startsWith("/embed/checkout") ||
    pathname.startsWith("/embed/bestellung") ||
    pathname.startsWith("/embed/warenkorb")
  ) {
    return null;
  }

  return (
    <div className="sticky bottom-0 z-20 border-t border-[#e2e8f0] bg-white/95 px-3 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tf-navy)]">
            <ShoppingCart className="h-3.5 w-3.5 text-[var(--tf-teal)]" aria-hidden />
            {itemCount} {itemCount === 1 ? "Ticket" : "Tickets"}
            {grossFormatted ? (
              <span className="font-normal text-[var(--tf-text-secondary)]">
                · {grossFormatted}
              </span>
            ) : null}
          </p>
        </div>
        <Link
          href="/embed/warenkorb"
          className="tf-btn tf-btn-secondary !min-h-9 !px-2.5 !text-xs"
        >
          Warenkorb
        </Link>
        <Link href="/embed/checkout" className="tf-btn tf-btn-primary !min-h-9 !px-2.5 !text-xs">
          Zur Kasse
        </Link>
      </div>
    </div>
  );
}
