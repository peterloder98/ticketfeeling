"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function normalizePromo(raw: string) {
  const code = raw.trim().toUpperCase();
  if (!code) return "";
  if (["KEINEN", "KEIN", "NONE", "NULL", "-", "N/A"].includes(code)) return "";
  return code;
}

function promoErrorMessage(code: string) {
  switch (code) {
    case "DISCOUNT_NOT_FOUND":
    case "DISCOUNT_NOT_YET_VALID":
    case "DISCOUNT_EXPIRED":
    case "DISCOUNT_EXHAUSTED":
    case "DISCOUNT_WRONG_EVENT":
    case "DISCOUNT_MIN_ORDER":
      return "Rabattcode nicht gültig";
    case "GIFT_CARD_NOT_FOUND":
    case "GIFT_CARD_EXPIRED":
    case "GIFT_CARD_EMPTY":
      return "Gutscheincode nicht gültig";
    case "CODE_NOT_FOUND":
      return "Code nicht gültig";
    default:
      return "Code nicht gültig";
  }
}

export function PromoCodeForm({
  initialDiscount,
  initialGift,
  variant = "default",
}: {
  initialDiscount?: string | null;
  initialGift?: string | null;
  /** compact = smaller, for checkout summary column */
  variant?: "default" | "compact";
}) {
  const router = useRouter();
  const initial = normalizePromo(initialDiscount || initialGift || "");
  const [code, setCode] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOk(false);
    const normalized = normalizePromo(code);
    setCode(normalized);
    try {
      const response = await fetch("/api/v1/cart/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized || null }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(promoErrorMessage(String(data?.error?.code ?? "CODE_NOT_FOUND")));
        return;
      }
      setOk(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (variant === "compact") {
    return (
      <form onSubmit={onSubmit} className="border-t border-[var(--tf-line)] pt-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-[var(--tf-navy)]">Gutscheincode</span>
          <div className="flex gap-2">
            <input
              className="tf-input !min-h-9 flex-1 text-sm"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Code"
              autoComplete="off"
            />
            <button
              type="submit"
              className="tf-btn tf-btn-secondary !min-h-9 shrink-0 px-3 text-xs"
              disabled={loading}
            >
              {loading ? "…" : "OK"}
            </button>
          </div>
        </label>
        {error ? <p className="mt-1.5 text-xs text-[var(--danger)]">{error}</p> : null}
        {ok && !error ? (
          <p className="mt-1.5 text-xs text-[var(--tf-teal-hover)]">Übernommen.</p>
        ) : null}
      </form>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[20px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_8px_28px_rgba(15,39,71,0.05)]"
    >
      <h2 className="text-base font-semibold text-[var(--tf-navy)]">Rabatt- oder Gutscheincode</h2>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5 text-sm">
          <span className="font-medium text-[var(--tf-text-secondary)]">Code</span>
          <input
            className="tf-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Code eingeben"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="tf-btn tf-btn-secondary !min-h-12 shrink-0 text-sm"
          disabled={loading}
        >
          {loading ? "Prüfe…" : "Anwenden"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {ok && !error ? (
        <p className="mt-3 text-sm text-[var(--tf-teal-hover)]">Code übernommen.</p>
      ) : null}
    </form>
  );
}
