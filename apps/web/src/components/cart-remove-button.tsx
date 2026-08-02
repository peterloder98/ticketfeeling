"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/components/cart-context";

export function CartRemoveButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { refresh } = useCart();
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    await fetch(`/api/v1/cart/items/${itemId}`, { method: "DELETE" });
    await refresh();
    router.refresh();
    setLoading(false);
  }

  return (
    <button type="button" className="tf-btn tf-btn-secondary !py-2 text-sm" onClick={remove} disabled={loading}>
      Entfernen
    </button>
  );
}
