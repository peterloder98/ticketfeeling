"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Mail, Smartphone, ShieldCheck, Headphones, BadgeCheck } from "lucide-react";
import { formatEuroFromCents } from "@/lib/money";
import { useCart } from "@/components/cart-context";
import { cartFetch } from "@/lib/commerce/cart-client";
import { cartErrorMessage } from "@/lib/commerce/cart-error-messages";
import { applyDiscountOff } from "@/lib/commerce/event-pricing";
import { CampaignPriceDisplay } from "@/components/campaign-price-display";
import { trackTfEvent } from "@/lib/tracking/client";

type Category = {
  id: string;
  name: string;
  description: string | null;
  priceGrossCents: number;
  listPriceGrossCents?: number;
  campaignName?: string | null;
  campaignValidUntil?: string | null;
  available: number;
  maxPerOrder: number;
};

type AccessibilityOfferProp = {
  label: string;
  type: string;
  value: number;
};

export function AddToCartPanel({
  categories,
  feeSurchargeNote,
  showRemainingAvailability = false,
  compact = false,
  cartHref = "/warenkorb",
  checkoutHref = "/checkout",
  accessibilityOffer = null,
  eventSlug = null,
  eventId = null,
  eventTitle = null,
}: {
  categories: Category[];
  feeSurchargeNote?: string;
  showRemainingAvailability?: boolean;
  breakOutToTop?: boolean;
  compact?: boolean;
  cartHref?: string;
  checkoutHref?: string;
  accessibilityOffer?: AccessibilityOfferProp | null;
  /** Meta AddToCart content ids / ViewContent continuity */
  eventSlug?: string | null;
  eventId?: string | null;
  eventTitle?: string | null;
}) {
  const { bump } = useCart();
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(categories.map((c) => [c.id, c.available < 1 ? 0 : 1])),
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const [accessibilitySelected, setAccessibilitySelected] = useState(false);

  const displayPrice = useMemo(() => {
    return (category: Category) => {
      const list = category.listPriceGrossCents ?? category.priceGrossCents;
      const base = category.priceGrossCents;
      if (!accessibilitySelected || !accessibilityOffer) {
        return { unit: base, list };
      }
      const unit = applyDiscountOff(base, accessibilityOffer.type, accessibilityOffer.value);
      return { unit, list };
    };
  }, [accessibilityOffer, accessibilitySelected]);

  function setQuantity(categoryId: string, next: number, max: number) {
    const value = Math.max(max < 1 ? 0 : 1, Math.min(Math.max(0, max), next));
    setQty((prev) => ({ ...prev, [categoryId]: value }));
  }

  async function add(categoryId: string) {
    setLoadingId(categoryId);
    setError(null);
    try {
      const response = await cartFetch("/api/v1/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 25_000,
        body: JSON.stringify({
          categoryId,
          quantity: qty[categoryId] ?? 1,
          accessibilitySelected: Boolean(accessibilityOffer && accessibilitySelected),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const code = String(data?.error?.code ?? "");
        const available =
          typeof data?.error?.available === "number" ? data.error.available : null;
        if (code === "INSUFFICIENT_STOCK" && available != null && available > 0) {
          const cat = categories.find((c) => c.id === categoryId);
          const max = Math.min(cat?.maxPerOrder ?? available, available);
          setQuantity(categoryId, available, max);
          setError(cartErrorMessage(code, { available }));
          return;
        }
        if ((code === "SOLD_OUT" || code === "INSUFFICIENT_STOCK") && available === 0) {
          setQuantity(categoryId, 0, 0);
        }
        setError(cartErrorMessage(code, { available }));
        return;
      }
      try {
        sessionStorage.removeItem("tf-cart-reminder-dismissed-count");
      } catch {
        /* ignore */
      }
      const cat = categories.find((c) => c.id === categoryId);
      const quantity = qty[categoryId] ?? 1;
      const unit = cat ? displayPrice(cat).unit : 0;
      void trackTfEvent("add_to_cart", {
        eventSlug,
        valueCents: unit * quantity,
        currency: "EUR",
        payload: {
          contentIds: eventId ? [eventId] : cat ? [cat.id] : [],
          contentName: eventTitle || cat?.name || null,
          numItems: quantity,
          quantity,
          contents: [
            {
              id: eventId || categoryId,
              quantity,
              item_price: unit / 100,
            },
          ],
          funnelStage: "add_to_cart",
        },
      });
      bump({
        itemCount: data?.summary?.itemCount,
        sessionKey: typeof data?.sessionKey === "string" ? data.sessionKey : undefined,
        grossFormatted:
          typeof data?.summary?.grossFormatted === "string"
            ? data.summary.grossFormatted
            : typeof data?.summary?.grossCents === "number"
              ? formatEuroFromCents(data.summary.grossCents)
              : undefined,
        expiresAt: data?.expiresAt
          ? typeof data.expiresAt === "string"
            ? data.expiresAt
            : new Date(data.expiresAt).toISOString()
          : undefined,
      });
      setJustAdded(true);
    } catch (err) {
      const code =
        err instanceof Error && err.message === "REQUEST_TIMEOUT"
          ? "REQUEST_TIMEOUT"
          : "";
      setError(cartErrorMessage(code));
    } finally {
      setLoadingId(null);
    }
  }

  if (categories.length === 0) {
    return <p className="text-base text-[var(--tf-text-secondary)]">Aktuell keine buchbaren Kategorien.</p>;
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {accessibilityOffer ? (
        <label className="flex items-start gap-2 rounded-[14px] border border-[var(--tf-line)] bg-white px-3 py-2.5 text-sm text-[var(--tf-navy)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={accessibilitySelected}
            onChange={(e) => setAccessibilitySelected(e.target.checked)}
          />
          <span>
            <span className="font-semibold">{accessibilityOffer.label}</span>
            <span className="mt-0.5 block text-[var(--tf-text-secondary)]">
              Ermäßigten Preis für diese Tickets wählen
            </span>
          </span>
        </label>
      ) : null}

      {categories.map((category) => {
        const max = Math.min(category.maxPerOrder, Math.max(0, category.available));
        const soldOut = category.available < 1;
        const current = qty[category.id] ?? 1;
        const price = displayPrice(category);
        return (
          <div
            key={category.id}
            className={
              compact
                ? "rounded-lg border border-[var(--tf-line)] bg-[#f8fafc] px-2.5 py-2"
                : "rounded-[16px] border border-[var(--tf-line)] bg-[#f8fafc] p-4"
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p
                  className={`font-semibold text-[var(--tf-navy)] ${compact ? "text-sm" : "text-base"}`}
                >
                  {category.name}
                </p>
                <CampaignPriceDisplay
                  className={compact ? "mt-0.5" : "mt-1"}
                  listCents={price.list}
                  unitCents={price.unit}
                  promoLabel={
                    accessibilitySelected && accessibilityOffer
                      ? accessibilityOffer.label
                      : category.campaignName
                  }
                  validUntil={
                    accessibilitySelected && accessibilityOffer
                      ? null
                      : category.campaignValidUntil
                  }
                  feeNote={feeSurchargeNote}
                  size={compact ? "sm" : "md"}
                />
              </div>
              {soldOut ? (
                <p className="text-[11px] font-medium text-[var(--tf-text-secondary)]">Ausverkauft</p>
              ) : showRemainingAvailability ? (
                <p className="text-[11px] font-medium text-[var(--tf-text-secondary)]">
                  Noch {category.available}
                </p>
              ) : null}
            </div>
            {category.description && !compact ? (
              <p className="mt-2 text-sm leading-relaxed text-[var(--tf-text-secondary)]">
                {category.description}
              </p>
            ) : null}

            <div
              className={`flex items-center gap-2 ${compact ? "mt-2" : "mt-4 flex-wrap gap-3"}`}
            >
              <div
                className={`inline-flex shrink-0 items-center border border-[var(--tf-line)] bg-white ${
                  compact ? "rounded-md" : "rounded-[14px]"
                }`}
              >
                <button
                  type="button"
                  className={`inline-flex items-center justify-center text-[var(--tf-navy)] disabled:opacity-40 ${
                    compact ? "h-8 w-8" : "h-11 w-11"
                  }`}
                  aria-label="Weniger"
                  disabled={soldOut || current <= 1}
                  onClick={() => setQuantity(category.id, current - 1, max)}
                >
                  <Minus className="h-4 w-4" strokeWidth={2} />
                </button>
                <span
                  className={`text-center font-semibold tabular-nums text-[var(--tf-navy)] ${
                    compact ? "min-w-6 text-sm" : "min-w-10 text-base"
                  }`}
                >
                  {current}
                </span>
                <button
                  type="button"
                  className={`inline-flex items-center justify-center text-[var(--tf-navy)] disabled:opacity-40 ${
                    compact ? "h-8 w-8" : "h-11 w-11"
                  }`}
                  aria-label="Mehr"
                  disabled={soldOut || current >= max}
                  onClick={() => setQuantity(category.id, current + 1, max)}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
              <button
                type="button"
                className={`tf-btn tf-btn-primary flex-1 text-sm ${
                  compact ? "!min-h-8 !rounded-md !px-2.5 !text-xs" : "!min-h-11"
                }`}
                disabled={soldOut || current < 1 || loadingId === category.id}
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
        <div
          className={`rounded-[16px] border border-[var(--tf-teal)]/30 bg-[rgba(20,184,166,0.08)] ${
            compact ? "p-2.5" : "p-4"
          }`}
        >
          <p className={`font-semibold text-[var(--tf-navy)] ${compact ? "text-sm" : "text-base"}`}>
            Im Warenkorb
          </p>
          <div className={`mt-2 flex flex-wrap gap-2 ${compact ? "gap-1.5" : ""}`}>
            <Link
              href={cartHref}
              className={`tf-btn tf-btn-secondary ${compact ? "!min-h-8 !text-xs" : "!min-h-10 text-sm"}`}
            >
              Warenkorb
            </Link>
            <Link
              href={checkoutHref}
              className={`tf-btn tf-btn-primary ${compact ? "!min-h-8 !text-xs" : "!min-h-10 text-sm"}`}
            >
              Zur Kasse
            </Link>
          </div>
        </div>
      ) : null}

      {!compact ? (
        <ul className="space-y-2 pt-1 text-sm text-[var(--tf-text-secondary)]">
          <li className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} />
            Tickets per E-Mail
          </li>
          <li className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} />
            Handy-Ticket möglich
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} />
            Sichere Zahlung
          </li>
          <li className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} />
            Support bei Fragen
          </li>
          <li className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-[var(--tf-teal)]" strokeWidth={2} />
            Offizieller Vorverkauf
          </li>
        </ul>
      ) : null}
    </div>
  );
}
