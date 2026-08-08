import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { readCartSessionCandidatesFromRequest } from "@/lib/commerce/cart-session";
import { getSeatMapPayload } from "@/lib/seating/map-payload";

type Props = { params: Promise<{ eventId: string }> };

/**
 * Resolve cart item ids for held_by_you highlighting.
 * Tries each session candidate (header, then cookie) so a stale sessionStorage
 * key cannot make this cart's holds look sold.
 */
async function viewerCartItemIdsForEvent(
  eventId: string,
  sessionKeys: string[],
): Promise<{ itemIds: string[]; sessionKey: string | null }> {
  if (sessionKeys.length === 0) return { itemIds: [], sessionKey: null };
  const org = await getDefaultOrganization();
  if (!org) return { itemIds: [], sessionKey: null };
  const now = new Date();

  // One query for all session candidates — avoids N sequential round-trips on the map path.
  const carts = await prisma.cart.findMany({
    where: {
      organizationId: org.id,
      sessionKey: { in: sessionKeys },
      status: "open",
      expiresAt: { gt: now },
    },
    select: {
      sessionKey: true,
      items: {
        where: { eventId },
        select: { id: true },
      },
    },
  });
  const byKey = new Map(carts.map((c) => [c.sessionKey, c]));

  let fallbackEmptyKey: string | null = null;
  for (const sessionKey of sessionKeys) {
    const cart = byKey.get(sessionKey);
    if (!cart) continue;
    const itemIds = cart.items.map((item) => item.id);
    if (itemIds.length > 0) {
      return { itemIds, sessionKey };
    }
    if (!fallbackEmptyKey) fallbackEmptyKey = sessionKey;
  }
  return { itemIds: [], sessionKey: fallbackEmptyKey ?? sessionKeys[0] ?? null };
}

export async function GET(request: Request, { params }: Props) {
  try {
    const [{ eventId }, sessionKeys] = await Promise.all([
      params,
      readCartSessionCandidatesFromRequest(request),
    ]);
    const url = new URL(request.url);
    const categoryId = url.searchParams.get("categoryId");

    const { itemIds: viewerCartItemIds, sessionKey } = await viewerCartItemIdsForEvent(
      eventId,
      sessionKeys,
    );
    const map = await getSeatMapPayload(eventId, {
      viewerCartItemIds,
      categoryId: categoryId || null,
    });
    if (!map) {
      return NextResponse.json({ error: { code: "NO_SEAT_MAP" } }, { status: 404 });
    }
    // Echo sessionKey so cartFetch can sync sessionStorage (cookie is HttpOnly).
    return NextResponse.json({
      ok: true,
      map,
      sessionKey,
      viewerHoldCount: viewerCartItemIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
