"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cartFetch, clearStoredCartSession, storeCartSession } from "@/lib/commerce/cart-client";

export type CartSnapshot = {
  itemCount: number;
  grossFormatted: string | null;
  expiresAt: string | null;
};

type CartContextValue = CartSnapshot & {
  loading: boolean;
  refresh: (opts?: { full?: boolean }) => Promise<void>;
  bump: (summary?: {
    itemCount?: number;
    grossFormatted?: string | null;
    expiresAt?: string | null;
    sessionKey?: string | null;
  }) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const EMPTY: CartSnapshot = {
  itemCount: 0,
  grossFormatted: null,
  expiresAt: null,
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<CartSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async (opts?: { full?: boolean }) => {
    const requestId = ++requestIdRef.current;
    try {
      const path = opts?.full ? "/api/v1/cart" : "/api/v1/cart?summary=1";
      const response = await cartFetch(path);
      if (requestId !== requestIdRef.current) return;
      if (!response.ok) {
        // Keep last known cart — don't wipe after a successful add.
        return;
      }
      const data = await response.json();
      if (requestId !== requestIdRef.current) return;
      if (typeof data?.sessionKey === "string") {
        storeCartSession(data.sessionKey);
      }
      const itemCount =
        typeof data?.summary?.itemCount === "number"
          ? data.summary.itemCount
          : Array.isArray(data?.items)
            ? data.items.reduce(
                (sum: number, item: { quantity?: number }) => sum + (item.quantity ?? 0),
                0,
              )
            : 0;
      const expiresRaw = data?.expiresAt ?? null;

      setSnapshot((prev) => {
        // Ignore stale summary that reports empty while we still show items
        // (race: mount peek finishing after a successful add).
        if (
          !opts?.full &&
          itemCount === 0 &&
          prev.itemCount > 0 &&
          requestId !== requestIdRef.current
        ) {
          return prev;
        }
        // Another guard: never let a summary-only poll clear a just-bumped cart
        // unless a later full refresh confirmed empty (handled below via full).
        if (!opts?.full && itemCount === 0 && prev.itemCount > 0) {
          return prev;
        }
        return {
          itemCount,
          grossFormatted:
            data?.summary?.grossFormatted ?? (itemCount > 0 ? prev.grossFormatted : null),
          expiresAt:
            typeof expiresRaw === "string"
              ? expiresRaw
              : expiresRaw
                ? new Date(expiresRaw).toISOString()
                : null,
        };
      });
    } catch {
      /* keep previous snapshot on network errors */
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const bump = useCallback(
    (summary?: {
      itemCount?: number;
      grossFormatted?: string | null;
      expiresAt?: string | null;
      sessionKey?: string | null;
    }) => {
      if (summary?.sessionKey) {
        storeCartSession(summary.sessionKey);
      }
      // Invalidate in-flight peeks so they cannot overwrite this bump.
      requestIdRef.current += 1;
      const bumpRequestId = requestIdRef.current;

      if (
        summary?.itemCount != null ||
        summary?.grossFormatted !== undefined ||
        summary?.expiresAt !== undefined
      ) {
        setSnapshot((prev) => {
          const nextCount = summary.itemCount ?? prev.itemCount;
          if (nextCount === 0) clearStoredCartSession();
          return {
            itemCount: nextCount,
            grossFormatted:
              nextCount === 0
                ? null
                : summary.grossFormatted !== undefined
                  ? summary.grossFormatted
                  : prev.grossFormatted,
            expiresAt:
              nextCount === 0
                ? null
                : summary.expiresAt !== undefined
                  ? summary.expiresAt
                    ? new Date(summary.expiresAt).toISOString()
                    : null
                  : prev.expiresAt,
          };
        });
      }
      // Confirm totals; ignore if another bump already advanced the request id.
      void refresh({ full: true }).then(() => {
        void bumpRequestId;
      });
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    let lastFocusRefresh = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefresh < 30_000) return;
      lastFocusRefresh = now;
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const value = useMemo(
    () => ({ ...snapshot, loading, refresh, bump }),
    [snapshot, loading, refresh, bump],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
