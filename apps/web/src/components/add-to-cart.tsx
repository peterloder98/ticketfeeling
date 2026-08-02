"use client";

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, Mail, Smartphone, ShieldCheck, Headphones, BadgeCheck } from "lucide-react";
import { formatEuroFromCents } from "@/lib/money";
import { useCart } from "@/components/cart-context";

type Category = {
  id: string;
  name: string;
  description: string | null;
  priceGrossCents: number;
  available: number;
  maxPerOrder: number;
};

export function AddToCartPanel({
  categories,
  feeSurchargeNote,
  showRemainingAvailability = false,
  /** Open cart/checkout in top window (required for reliable iframe checkout) */
  breakOutToTop = false,
  /** Denser layout for iframe embeds */
  compact = false,
}: {
  categories: Category[];
  /** e.g. "zzgl. 3 % Verwaltungsgebühr" — shown under ticket price */
  feeSurchargeNote?: string;
  showRemainingAvailability?: boolean;
  breakOutToTop?: boolean;
  compact?: boolean;
}) {
  const { bump } = useCart();
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(categories.map((c) => [c.id, 1])),
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  function setQuantity(categoryId: string, next: number, max: number) {
    const value = Math.max(1, Math.min(max, next));
    setQty((prev) => ({ ...prev, [categoryId]: value }));
  }

  async function add(categoryId: string) {
    setLoadingId(categoryId);
    setError(null);
    try {
      const response = await fetch("/api/v1/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, quantity: qty[categoryId] ?? 1 }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.code ?? "Fehler beim Hinzufügen");
        return;
      }
      try {
        sessionStorage.removeItem("tf-cart-reminder-dismissed-count");
      } catch {
        /* ignore */
      }
      bump({
        itemCount: data?.summary?.itemCount,
        expiresAt: data?.expiresAt
          ? typeof data.expiresAt === "string"
            ? data.expiresAt
            : new Date(data.expiresAt).toISOString()
          : undefined,
      });
      setJustAdded(true);
    } finally {
      setLoadingId(null);
    }
  }

  if (categories.length === 0) {
    return <p className="text-base text-[var(--tf-text-secondary)]">Aktuell keine buchbaren Kategorien.</p>;
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {categories.map((category) => {
        const max = Math.min(category.maxPerOrder, Math.max(0, category.available));
        const soldOut = category.available < 1;
        const current = qty[category.id] ?? 1;
        return (
          <div
            key={category.id}
            className={
              compact
                ? "rounded-xl border border-[var(--tf-line)] bg-white px-3 py-2.5"
                : "rounded-[16px] border border-[var(--tf-line)] bg-[#f8fafc] p-4"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p
                  className={`font-semibold text-[var(--tf-navy)] ${compact ? "text-sm" : "text-base"}`}
                >
                  {category.name}
                </p>
                <p
                  className={`font-bold text-[var(--tf-navy)] ${compact ? "mt-0.5 text-base" : "mt-1 text-lg"}`}
                >
                  {formatEuroFromCents(category.priceGrossCents)}
                  {feeSurchargeNote ? (
                    <span className="ml-1.5 text-[11px] font-normal text-[var(--tf-text-secondary)]">
                      {feeSurchargeNote}
                    </span>
                  ) : null}
                </p>
              </div>
              {soldOut ? (
                <p className="text-xs font-medium text-[var(--tf-text-secondary)]">Ausverkauft</p>
              ) : showRemainingAvailability ? (
                <p className="text-xs font-medium text-[var(--tf-text-secondary)]">
                  Noch {category.available}
                </p>
              ) : null}
            </div>
            {category.description && !compact ? (
              <p className="mt-2 text-sm leading-relaxed text-[var(--tf-text-secondary)]">
                {category.description}
              </p>
            ) : null}
            {category.description && compact ? (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--tf-text-secondary)]">
                {category.description}
              </p>
            ) : null}

            <div className={`flex flex-wrap items-center gap-2 ${compact ? "mt-2" : "mt-4 gap-3"}`}>
              <div
                className={`inline-flex items-center border border-[var(--tf-line)] bg-white ${
                  compact ? "rounded-lg" : "rounded-[14px]"
                }`}
              >
                <button
                  type="button"
                  className={`inline-flex items-center justify-center text-[var(--tf-navy)] disabled:opacity-40 ${
                    compact ? "h-9 w-9" : "h-11 w-11"
                  }`}
                  aria-label="Weniger"
                  disabled={soldOut || current <= 1}
                  onClick={() => setQuantity(category.id, current - 1, max || 1)}
                >
                  <Minus className="h-4 w-4" strokeWidth={2} />
                </button>
                <span
                  className={`text-center font-semibold tabular-nums text-[var(--tf-navy)] ${
                    compact ? "min-w-8 text-sm" : "min-w-10 text-base"
                  }`}
                >
                  {current}
                </span>
                <button
                  type="button"
                  className={`inline-flex items-center justify-center text-[var(--tf-navy)] disabled:opacity-40 ${
                    compact ? "h-9 w-9" : "h-11 w-11"
                  }`}
                  aria-label="Mehr"
                  disabled={soldOut || current >= max}
                  onClick={() => setQuantity(category.id, current + 1, max || 1)}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
              <button
                type="button"
                className={`tf-btn tf-btn-primary flex-1 text-sm sm:flex-none ${
                  compact ? "!min-h-9 !px-3" : "!min-h-11"
                }`}
                disabled={soldOut || loadingId === category.id}
                onClick={() => add(category.id)}
              >
                {soldOut ? "Ausverkauft" : loadingId === category.id ? "…" : "In den Warenkorb"}
              </button>
            </div>
          </div>
        );
      })}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {justAdded ? (
        <p
          className={`rounded-xl border border-[var(--tf-line)] bg-[rgba(20,184,166,0.08)] text-[var(--tf-navy)] ${
            compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          }`}
        >
          Im Warenkorb.{" "}
          <Link
            href="/warenkorb"
            target={breakOutToTop ? "_top" : undefined}
            className="font-semibold text-[var(--tf-teal)] underline"
          >
            Ansehen
          </Link>
          {" · "}
          <Link
            href="/checkout"
            target={breakOutToTop ? "_top" : undefined}
            className="font-semibold text-[var(--tf-teal)] underline"
          >
            Zur Kasse
          </Link>
        </p>
      ) : null}

      {compact ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-[var(--tf-text-secondary)]">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-[var(--tf-teal)]" aria-hidden />
            Sichere Zahlung
          </span>
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3 w-3 text-[var(--tf-teal)]" aria-hidden />
            Ticket per E-Mail
          </span>
          <span className="inline-flex items-center gap-1">
            <BadgeCheck className="h-3 w-3 text-[var(--tf-teal)]" aria-hidden />
            Direkt beim Veranstalter
          </span>
        </p>
      ) : (
        <ul className="space-y-2 border-t border-[var(--tf-line)] pt-4 text-sm text-[var(--tf-text-secondary)]">
          <li className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
            Direkt beim Veranstalter buchen
          </li>
          <li className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
            Ticket sofort per E-Mail
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
            Sichere Zahlungsabwicklung
          </li>
          <li className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
            Persönliche Hilfe bei Fragen
          </li>
          <li className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} aria-hidden />
            Digitales Ticket auf dem Smartphone
          </li>
        </ul>
      )}
    </div>
  );
}
