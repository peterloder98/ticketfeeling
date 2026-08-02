import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOpenCart } from "@/lib/commerce/cart";
import { readCartSessionKey } from "@/lib/commerce/cart-session";
import { getSeatMapPayload } from "@/lib/seating/map-payload";

type Props = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Props) {
  try {
    const { eventId } = await params;
    const session = await getServerSession(authOptions);
    const sessionKey = await readCartSessionKey();
    const cart = await getOpenCart({ userId: session?.user?.id, sessionKey });
    const viewerCartItemIds = cart.items
      .filter((i) => i.eventId === eventId)
      .map((i) => i.id);

    const map = await getSeatMapPayload(eventId, { viewerCartItemIds });
    if (!map) {
      return NextResponse.json({ error: { code: "NO_SEAT_MAP" } }, { status: 404 });
    }
    return NextResponse.json({ ok: true, map });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
