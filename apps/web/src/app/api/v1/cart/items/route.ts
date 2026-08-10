import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { addToCart } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import {
  cartCookieHeader,
  readCartSessionKeyFromRequest,
} from "@/lib/commerce/cart-session";
import { formatEuroFromCents } from "@/lib/money";
import { assertMutationAllowed } from "@/lib/security/mutation-guard";
import { clientIpFromRequest, takeRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  categoryId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
  seatingMode: z.enum(["best_available", "seat_map", "free"]).optional(),
  seatIds: z.array(z.string().uuid()).max(20).optional(),
  accessibilitySelected: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = assertMutationAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: { code: guard.code } }, { status: 403 });
  }
  const ip = clientIpFromRequest(request);
  const limited = await takeRateLimit({
    key: `cart-add:${ip}`,
    limit: 40,
    windowMs: 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED" } },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  try {
    const [rawBody, session, sessionKey] = await Promise.all([
      request.json(),
      getServerSession(authOptions),
      readCartSessionKeyFromRequest(request),
    ]);
    const body = schema.parse(rawBody);
    const cart = await addToCart({
      categoryId: body.categoryId,
      quantity: body.quantity,
      seatingMode: body.seatingMode,
      seatIds: body.seatIds,
      accessibilitySelected: body.accessibilitySelected,
      userId: session?.user?.id,
      sessionKey,
    });
    const priced = await priceCart(cart);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const response = NextResponse.json({
      ok: true,
      cartId: cart.id,
      sessionKey: cart.sessionKey,
      summary: {
        ...priced,
        itemCount,
        grossFormatted: formatEuroFromCents(priced.grossCents, priced.currency),
      },
      expiresAt: cart.expiresAt,
      seats: cart.items.flatMap((item) =>
        item.seats.map((s) => ({
          cartItemId: item.id,
          seatLabel: `${s.blockLabel} · Reihe ${s.rowLabel} · Platz ${s.seatNumber}`,
        })),
      ),
    });
    response.headers.append("Set-Cookie", cartCookieHeader(cart.sessionKey));
    return response;
  } catch (error) {
    const { isCartSeatError } = await import("@/lib/commerce/cart-seat-error");
    const message = error instanceof Error ? error.message : "ERROR";
    const available =
      error &&
      typeof error === "object" &&
      "available" in error &&
      typeof (error as { available: unknown }).available === "number"
        ? (error as { available: number }).available
        : undefined;
    const seatMeta = isCartSeatError(error)
      ? {
          unavailableSeatIds: error.unavailableSeatIds,
          availableSeatIds: error.availableSeatIds,
          unavailableCount: error.unavailableSeatIds?.length,
        }
      : {};
    const status =
      message === "SOLD_OUT" ||
      message === "INSUFFICIENT_STOCK" ||
      message === "QUANTITY_LIMIT" ||
      message === "SEATS_UNAVAILABLE" ||
      message === "COMPANION_SEAT_UNAVAILABLE" ||
      message === "SEATS_REQUIRED" ||
      message === "CREATES_SINGLETON_GAP"
        ? 409
        : 400;
    return NextResponse.json(
      {
        error: {
          code: message,
          ...(available !== undefined ? { available } : {}),
          ...seatMeta,
        },
      },
      { status },
    );
  }
}
