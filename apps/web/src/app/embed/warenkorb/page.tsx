import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOpenCart } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import { readCartSessionKey } from "@/lib/commerce/cart-session";
import { formatEuroFromCents } from "@/lib/money";
import { CartRemoveButton } from "@/components/cart-remove-button";
import { CartCountdownDisplay } from "@/components/cart-countdown-display";

export const dynamic = "force-dynamic";
export const metadata = { title: "Warenkorb" };

export default async function EmbedCartPage() {
  const session = await getServerSession(authOptions);
  const sessionKey = await readCartSessionKey();
  const cart = await getOpenCart({ userId: session?.user?.id, sessionKey });
  const summary = await priceCart(cart);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-[var(--tf-navy)]">Warenkorb</h1>
        <Link href="/embed/shop" className="text-xs font-medium text-[var(--tf-teal)] underline">
          Weiter shoppen
        </Link>
      </div>

      {cart.items.length > 0 ? (
        <CartCountdownDisplay expiresAt={cart.expiresAt.toISOString()} />
      ) : null}

      <div className="space-y-2">
        {cart.items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--tf-navy)]">
                  {item.quantity}× {item.category.name}
                </p>
                <p className="text-xs text-[var(--tf-text-secondary)]">
                  {item.category.event.name}
                </p>
                {item.seats.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--tf-teal-hover)]">
                    {item.seats.map((s) => (
                      <li key={s.id}>
                        {s.blockLabel} · R{s.rowLabel} · Pl. {s.seatNumber}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium tabular-nums">
                  {formatEuroFromCents(item.quantity * item.unitPriceGrossCents)}
                </p>
                <div className="mt-1">
                  <CartRemoveButton itemId={item.id} />
                </div>
              </div>
            </div>
          </div>
        ))}
        {cart.items.length === 0 ? (
          <p className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-6 text-center text-[var(--tf-text-secondary)]">
            Warenkorb ist leer.{" "}
            <Link href="/embed/shop" className="font-medium text-[var(--tf-teal)] underline">
              Events ansehen
            </Link>
          </p>
        ) : null}
      </div>

      {cart.items.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-[var(--tf-line)] p-3">
          <div className="space-y-1 text-xs">
            <p className="flex justify-between gap-3">
              <span className="text-[var(--tf-text-secondary)]">Tickets</span>
              <span className="tabular-nums">{formatEuroFromCents(summary.ticketsGrossCents)}</span>
            </p>
            {summary.feeGrossCents > 0 ? (
              <p className="flex justify-between gap-3">
                <span className="text-[var(--tf-text-secondary)]">{summary.feeLabel}</span>
                <span className="tabular-nums">{formatEuroFromCents(summary.feeGrossCents)}</span>
              </p>
            ) : null}
            <p className="flex justify-between gap-3 pt-1 text-base font-semibold text-[var(--tf-navy)]">
              <span>Gesamt</span>
              <span className="tabular-nums">{formatEuroFromCents(summary.grossCents)}</span>
            </p>
          </div>
          <Link href="/embed/checkout" className="tf-btn tf-btn-primary w-full !min-h-11">
            Zur Kasse
          </Link>
        </div>
      ) : null}
    </div>
  );
}
