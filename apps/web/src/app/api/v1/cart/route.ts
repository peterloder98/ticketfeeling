import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOpenCart } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import { cartCookieHeader, readCartSessionKey } from "@/lib/commerce/cart-session";
import { formatEuroFromCents } from "@/lib/money";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const sessionKey = await readCartSessionKey();
    const cart = await getOpenCart({ userId: session?.user?.id, sessionKey });
    const priced = await priceCart(cart);
    const response = NextResponse.json({
      id: cart.id,
      expiresAt: cart.expiresAt,
      summary: {
        ...priced,
        ticketsGrossFormatted: formatEuroFromCents(priced.ticketsGrossCents, priced.currency),
        feeGrossFormatted: formatEuroFromCents(priced.feeGrossCents, priced.currency),
        grossFormatted: formatEuroFromCents(priced.grossCents, priced.currency),
      },
      items: cart.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPriceGrossCents: item.unitPriceGrossCents,
        categoryName: item.category.name,
        eventName: item.category.event.name,
        eventSlug: item.category.event.slug,
        holdExpiresAt: item.hold?.expiresAt,
      })),
    });
    response.headers.append("Set-Cookie", cartCookieHeader(cart.sessionKey));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
