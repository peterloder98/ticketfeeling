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

const schema = z.object({
  categoryId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
  seatingMode: z.enum(["best_available", "seat_map", "free"]).optional(),
  seatIds: z.array(z.string().uuid()).max(20).optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const session = await getServerSession(authOptions);
    const sessionKey = await readCartSessionKeyFromRequest(request);
    const cart = await addToCart({
      categoryId: body.categoryId,
      quantity: body.quantity,
      seatingMode: body.seatingMode,
      seatIds: body.seatIds,
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
    const message = error instanceof Error ? error.message : "ERROR";
    const status =
      message === "SOLD_OUT" ||
      message === "QUANTITY_LIMIT" ||
      message === "SEATS_UNAVAILABLE" ||
      message === "COMPANION_SEAT_UNAVAILABLE" ||
      message === "SEATS_REQUIRED"
        ? 409
        : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
