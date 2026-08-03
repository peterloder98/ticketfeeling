import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findOpenCart, peekCartItemCount } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import {
  cartCookieHeader,
  readCartSessionKeyFromRequest,
} from "@/lib/commerce/cart-session";
import { formatEuroFromCents } from "@/lib/money";

export async function GET(request: Request) {
  try {
    const [session, sessionKey] = await Promise.all([
      getServerSession(authOptions),
      readCartSessionKeyFromRequest(request),
    ]);
    const url = new URL(request.url);
    const summaryOnly = url.searchParams.get("summary") === "1";

    // Header badge: skip cart create + full pricing on every focus/nav.
    if (summaryOnly) {
      const peek = await peekCartItemCount({
        userId: session?.user?.id,
        sessionKey,
      });
      const response = NextResponse.json({
        expiresAt: peek.expiresAt,
        sessionKey: peek.sessionKey,
        summary: {
          itemCount: peek.itemCount,
          grossFormatted: null,
        },
        items: [],
      });
      // Only re-affirm an existing session — never mint empty cookies on peek.
      if (peek.sessionKey && sessionKey && peek.sessionKey === sessionKey && peek.itemCount > 0) {
        response.headers.append("Set-Cookie", cartCookieHeader(peek.sessionKey));
      }
      return response;
    }

    // Full cart: if no session yet, return empty without creating a cart.
    if (!sessionKey) {
      return NextResponse.json({
        id: null,
        expiresAt: null,
        sessionKey: null,
        summary: {
          itemCount: 0,
          ticketsGrossCents: 0,
          feeGrossCents: 0,
          feeLabel: null,
          grossCents: 0,
          grossFormatted: null,
        },
        items: [],
      });
    }

    const cart = await findOpenCart({ userId: session?.user?.id, sessionKey });
    if (!cart) {
      return NextResponse.json({
        id: null,
        expiresAt: null,
        sessionKey,
        summary: {
          itemCount: 0,
          ticketsGrossCents: 0,
          feeGrossCents: 0,
          feeLabel: null,
          grossCents: 0,
          grossFormatted: null,
        },
        items: [],
      });
    }

    const priced = await priceCart(cart);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const response = NextResponse.json({
      id: cart.id,
      expiresAt: cart.expiresAt,
      sessionKey: cart.sessionKey,
      summary: {
        ...priced,
        itemCount,
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
        seats: item.seats.map((s) => ({
          id: s.id,
          blockLabel: s.blockLabel,
          rowLabel: s.rowLabel,
          seatNumber: s.seatNumber,
        })),
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
