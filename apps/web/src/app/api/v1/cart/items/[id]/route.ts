import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { removeCartItem } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import {
  cartCookieHeader,
  readCartSessionKeyFromRequest,
} from "@/lib/commerce/cart-session";

type Props = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Props) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const sessionKey = await readCartSessionKeyFromRequest(request);
    const cart = await removeCartItem(id, { userId: session?.user?.id, sessionKey });
    const priced = await priceCart(cart);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const response = NextResponse.json({
      ok: true,
      sessionKey: cart.sessionKey,
      summary: { ...priced, itemCount },
    });
    response.headers.append("Set-Cookie", cartCookieHeader(cart.sessionKey));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
