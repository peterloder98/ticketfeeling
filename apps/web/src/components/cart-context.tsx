"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

  const refresh = useCallback(async (opts?: { full?: boolean }) => {
    try {
      const path = opts?.full ? "/api/v1/cart" : "/api/v1/cart?summary=1";
      const response = await fetch(path, { credentials: "same-origin" });
      if (!response.ok) {
        setSnapshot(EMPTY);
        return;
      }
      const data = await response.json();
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
      setSnapshot((prev) => ({
        itemCount,
        // Summary poll skips pricing — keep last known total if still in cart
        grossFormatted:
          data?.summary?.grossFormatted ?? (itemCount > 0 ? prev.grossFormatted : null),
        expiresAt:
          typeof expiresRaw === "string"
            ? expiresRaw
            : expiresRaw
              ? new Date(expiresRaw).toISOString()
              : null,
      }));
    } catch {
      setSnapshot(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  const bump = useCallback(
    (summary?: {
      itemCount?: number;
      grossFormatted?: string | null;
      expiresAt?: string | null;
    }) => {
      if (
        summary?.itemCount != null ||
        summary?.grossFormatted !== undefined ||
        summary?.expiresAt !== undefined
      ) {
        setSnapshot((prev) => {
          const nextCount = summary.itemCount ?? prev.itemCount;
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
      void refresh({ full: true });
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
