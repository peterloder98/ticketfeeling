import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { readCartSessionKeyFromRequest } from "@/lib/commerce/cart-session";
import { getSeatMapPayload } from "@/lib/seating/map-payload";

type Props = { params: Promise<{ eventId: string }> };

/** Light lookup — avoid full cart include just for held_by_you highlighting. */
async function viewerCartItemIdsForEvent(
  eventId: string,
  sessionKey: string | null,
): Promise<string[]> {
  if (!sessionKey) return [];
  const org = await getDefaultOrganization();
  if (!org) return [];
  const now = new Date();
  const cart = await prisma.cart.findUnique({
    where: {
      organizationId_sessionKey: {
        organizationId: org.id,
        sessionKey,
      },
    },
    select: {
      status: true,
      expiresAt: true,
      items: {
        where: { eventId },
        select: { id: true },
      },
    },
  });
  if (!cart || cart.status !== "open" || cart.expiresAt < now) return [];
  return cart.items.map((item) => item.id);
}

export async function GET(request: Request, { params }: Props) {
  try {
    const [{ eventId }, sessionKey] = await Promise.all([
      params,
      readCartSessionKeyFromRequest(request),
    ]);
    const url = new URL(request.url);
    const categoryId = url.searchParams.get("categoryId");

    const viewerCartItemIds = await viewerCartItemIdsForEvent(eventId, sessionKey);
    const map = await getSeatMapPayload(eventId, {
      viewerCartItemIds,
      categoryId: categoryId || null,
    });
    if (!map) {
      return NextResponse.json({ error: { code: "NO_SEAT_MAP" } }, { status: 404 });
    }
    return NextResponse.json({ ok: true, map });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
