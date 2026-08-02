"use client";

import { useEffect, useState } from "react";
import {
  getCartCountdownState,
  type CartCountdownState,
} from "@/lib/cart-countdown";

/** Live 1s tick against cart reservation expiry. */
export function useCartCountdown(
  expiresAt: string | Date | null | undefined,
): CartCountdownState | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return getCartCountdownState(expiresAt, now);
}
