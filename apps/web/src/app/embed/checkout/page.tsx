import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOpenCart } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import { readCartSessionKey } from "@/lib/commerce/cart-session";
import { formatEuroFromCents } from "@/lib/money";
import { CheckoutForm } from "@/components/checkout-form";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  buildCheckoutPaymentOptions,
  parsePaymentFeeConfig,
} from "@/lib/commerce/payment-fees";
import { getPaymentProvider } from "@/lib/payments";
import { CartCountdownDisplay } from "@/components/cart-countdown-display";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zur Kasse" };

export default async function EmbedCheckoutPage() {
  const session = await getServerSession(authOptions);
  const sessionKey = await readCartSessionKey();
  const cart = await getOpenCart({ userId: session?.user?.id, sessionKey });
  const summary = await priceCart(cart);
  const org = await getDefaultOrganization();
  const feeConfig = parsePaymentFeeConfig(org?.settings?.paymentFeeConfig);
  const soonestEventMs = cart.items.reduce((min, item) => {
    const at = item.category.event.eventStartsAt?.getTime();
    if (at == null) return min;
    return min == null ? at : Math.min(min, at);
  }, null as number | null);
  const sepaMinDays = org?.settings?.sepaMinDaysBeforeEvent ?? 14;
  const sepaDisabled =
    soonestEventMs != null &&
    soonestEventMs - Date.now() < sepaMinDays * 24 * 60 * 60 * 1000;
  const stripeLiveConfigured = Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PUBLISHABLE_KEY &&
      getPaymentProvider().key === "stripe",
  );
  const paymentOptions = buildCheckoutPaymentOptions({
    customerTotalCents: summary.grossCents,
    config: feeConfig,
    stripeLiveConfigured,
    allowDevTestCheckout: getPaymentProvider().key === "dev",
    sepaDisabled,
  });

  let isStaff = false;
  if (session?.user?.id) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership) {
      isStaff =
        (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
        (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
        (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell"));
    }
  }

  if (cart.items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--tf-text-secondary)]">
        Warenkorb leer.{" "}
        <Link href="/embed/shop" className="font-medium text-[var(--tf-teal)] underline">
          Events entdecken
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-[var(--tf-navy)]">Zur Kasse</h1>
        <Link
          href="/embed/warenkorb"
          className="text-xs font-medium text-[var(--tf-teal)] underline"
        >
          Warenkorb
        </Link>
      </div>

      <CartCountdownDisplay expiresAt={cart.expiresAt.toISOString()} />

      <div className="rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tf-text-secondary)]">
          Bestellung
        </p>
        <ul className="mt-2 space-y-2">
          {cart.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2 text-xs">
              <span className="min-w-0 text-[var(--tf-navy)]">
                {item.quantity}× {item.category.name}
                <span className="block text-[var(--tf-text-secondary)]">
                  {item.category.event.name}
                </span>
              </span>
              <span className="shrink-0 tabular-nums font-medium">
                {formatEuroFromCents(item.quantity * item.unitPriceGrossCents)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between border-t border-[var(--tf-line)] pt-2 text-sm font-semibold text-[var(--tf-navy)]">
          <span>Gesamt</span>
          <span className="tabular-nums">{formatEuroFromCents(summary.grossCents)}</span>
        </p>
      </div>

      <CheckoutForm
        isLoggedIn={Boolean(session?.user)}
        isStaff={isStaff}
        loginEmail={session?.user?.email}
        paymentOptions={paymentOptions}
        customerTotalCents={summary.grossCents}
        embed
      />
    </div>
  );
}
