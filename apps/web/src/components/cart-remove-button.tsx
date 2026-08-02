"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/components/cart-context";
import { cartFetch } from "@/lib/commerce/cart-client";

export function CartRemoveButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { refresh, bump } = useCart();
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    try {
      const response = await cartFetch(`/api/v1/cart/items/${itemId}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (response.ok && typeof data?.summary?.itemCount === "number") {
        bump({
          itemCount: data.summary.itemCount,
          sessionKey: typeof data?.sessionKey === "string" ? data.sessionKey : undefined,
        });
      } else {
        await refresh({ full: true });
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="tf-btn tf-btn-secondary !py-2 text-sm"
      onClick={remove}
      disabled={loading}
    >
      Entfernen
    </button>
  );
}
