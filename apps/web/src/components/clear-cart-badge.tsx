"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart-context";

/** Clears cart UI badge/reminder after checkout conversion. */
export function ClearCartBadge() {
  const { bump, itemCount } = useCart();
  useEffect(() => {
    if (itemCount > 0) {
      bump({ itemCount: 0, expiresAt: null, grossFormatted: null });
    }
  }, [bump, itemCount]);
  return null;
}
