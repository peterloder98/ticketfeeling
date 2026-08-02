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

export default async function CartPage() {
  const session = await getServerSession(authOptions);
  const sessionKey = await readCartSessionKey();
  const cart = await getOpenCart({ userId: session?.user?.id, sessionKey });
  const summary = await priceCart(cart);

  return (
    <div className="tf-container py-12">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--gold-soft)]">
        Warenkorb
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Tickets sind 10 Minuten für dich reserviert.
      </p>
      {cart.items.length > 0 ? (
        <div className="mt-5">
          <CartCountdownDisplay expiresAt={cart.expiresAt.toISOString()} />
        </div>
      ) : null}

      <div className="mt-8 space-y-3">
        {cart.items.map((item) => (
          <div key={item.id} className="tf-card flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-[var(--tf-navy)]">
                {item.quantity}× {item.category.name}
              </p>
              <p className="text-sm text-[var(--tf-text-secondary)]">{item.category.event.name}</p>
              {item.category.categoryKind === "wheelchair" && item.category.companionFree ? (
                <p className="mt-1 text-xs font-medium text-[var(--tf-teal-hover)]">
                  Inkl. Begleitperson kostenfrei
                </p>
              ) : null}
              {item.seats.length > 0 ? (
                <ul className="mt-2 space-y-0.5 text-sm text-[var(--tf-teal-hover)]">
                  {item.seats.map((s, idx) => (
                    <li key={s.id}>
                      {s.blockLabel} · Reihe {s.rowLabel} · Platz {s.seatNumber}
                      {item.category.categoryKind === "wheelchair" &&
                      item.category.companionFree &&
                      idx % 2 === 1
                        ? " (Begleitung)"
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : item.seatingMode === "best_available" ? (
                <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">Bestplätze reserviert</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <p className="font-medium tabular-nums">
                {formatEuroFromCents(item.quantity * item.unitPriceGrossCents)}
              </p>
              <CartRemoveButton itemId={item.id} />
            </div>
          </div>
        ))}
        {cart.items.length === 0 ? (
          <p className="text-[var(--muted)]">
            Warenkorb ist leer. <Link href="/events" className="text-[var(--gold-soft)] underline">Events ansehen</Link>
          </p>
        ) : null}
      </div>

      {cart.items.length > 0 ? (
        <div className="tf-card mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            <p>Tickets: {formatEuroFromCents(summary.ticketsGrossCents)}</p>
            {summary.feeGrossCents > 0 ? (
              <p className="text-[var(--muted)]">
                {summary.feeLabel}: {formatEuroFromCents(summary.feeGrossCents)}
              </p>
            ) : null}
            <p className="text-lg">
              Gesamt: <strong>{formatEuroFromCents(summary.grossCents)}</strong>
            </p>
          </div>
          <Link href="/checkout" className="tf-btn tf-btn-primary">
            Zur Kasse
          </Link>
        </div>
      ) : null}
    </div>
  );
}
