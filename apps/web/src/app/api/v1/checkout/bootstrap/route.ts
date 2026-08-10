import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findOpenCart } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import {
  cartCookieHeader,
  readCartSessionKeyFromRequest,
} from "@/lib/commerce/cart-session";
import { getDefaultOrganization } from "@/lib/commerce/org";
import {
  getDefaultOrganizationForUser,
  getUserPermissionKeys,
} from "@/lib/rbac";
import {
  buildCheckoutPaymentOptions,
  parsePaymentFeeConfig,
  parsePaymentUiConfig,
} from "@/lib/commerce/payment-fees";
import { isSepaDisabledForCheckout } from "@/lib/commerce/sepa-availability";
import { getPaymentProvider } from "@/lib/payments";
import { isStripeTestMode } from "@/lib/payments/mode";
import { formatEuroFromCents } from "@/lib/money";

/** Embed checkout bootstrap: cart + payment options using x-cart-session backup. */
export async function GET(request: Request) {
  try {
    const [session, sessionKey] = await Promise.all([
      getServerSession(authOptions),
      readCartSessionKeyFromRequest(request),
    ]);
    const cart = sessionKey
      ? await findOpenCart({ userId: session?.user?.id, sessionKey })
      : null;

    if (!cart || cart.items.length === 0) {
      return NextResponse.json({
        empty: true,
        sessionKey: sessionKey ?? null,
        items: [],
        summary: null,
        paymentOptions: [],
        customerTotalCents: 0,
        isLoggedIn: Boolean(session?.user),
        isStaff: false,
        loginEmail: session?.user?.email ?? null,
      });
    }

    const [summary, org, isStaff] = await Promise.all([
      priceCart(cart),
      getDefaultOrganization(),
      (async () => {
        if (!session?.user?.id) return false;
        const membership = await getDefaultOrganizationForUser(session.user.id);
        if (!membership) return false;
        const keys = await getUserPermissionKeys(
          session.user.id,
          membership.organizationId,
        );
        return (
          keys.has("events:write") ||
          keys.has("org:write") ||
          keys.has("box_office:sell")
        );
      })(),
    ]);

    const feeConfig = parsePaymentFeeConfig(org?.settings?.paymentFeeConfig);
    const uiConfig = parsePaymentUiConfig(org?.settings?.paymentUiConfig);
    const sepaDisabled = isSepaDisabledForCheckout({
      orgSepaMinDays: org?.settings?.sepaMinDaysBeforeEvent ?? uiConfig.sepaMinDaysBeforeEvent,
      items: cart.items.map((item) => ({
        eventStartsAt: item.category.event.eventStartsAt,
        eventSepaMinDays: item.category.event.sepaMinDaysBeforeEvent,
      })),
    });
    const providerKey = getPaymentProvider().key;
    const stripeTest = isStripeTestMode();
    const stripeLiveConfigured = Boolean(
      process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_PUBLISHABLE_KEY &&
        providerKey === "stripe" &&
        !stripeTest,
    );
    const paymentOptions = buildCheckoutPaymentOptions({
      customerTotalCents: summary.grossCents,
      config: feeConfig,
      ui: uiConfig,
      stripeLiveConfigured,
      allowDevTestCheckout: providerKey === "dev" || stripeTest,
      sepaDisabled,
    });

    const response = NextResponse.json({
      empty: false,
      sessionKey: cart.sessionKey,
      expiresAt: cart.expiresAt,
      items: cart.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPriceGrossCents: item.unitPriceGrossCents,
        categoryName: item.category.name,
        eventName: item.category.event.name,
        eventSlug: item.category.event.slug,
        eventStartsAt: item.category.event.eventStartsAt,
        locationName: item.category.event.location?.name ?? null,
        locationCity: item.category.event.location?.city ?? null,
      })),
      summary: {
        ...summary,
        grossFormatted: formatEuroFromCents(summary.grossCents, summary.currency),
      },
      paymentOptions,
      customerTotalCents: summary.grossCents,
      isLoggedIn: Boolean(session?.user),
      isStaff,
      loginEmail: session?.user?.email ?? null,
    });
    response.headers.append("Set-Cookie", cartCookieHeader(cart.sessionKey));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
