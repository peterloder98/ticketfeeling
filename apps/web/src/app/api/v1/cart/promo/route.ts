import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOpenCart } from "@/lib/commerce/cart";
import { priceCart } from "@/lib/commerce/pricing";
import {
  cartCookieHeader,
  readCartSessionKeyFromRequest,
} from "@/lib/commerce/cart-session";
import { prisma } from "@/lib/db";
import {
  cartHasCampaignPrice,
  DISCOUNT_CAMPAIGN_ACTIVE,
} from "@/lib/commerce/campaign-promo";
import { resolveDiscountCode, resolveGiftCard } from "@/lib/commerce/discounts";
import { assertMutationAllowed } from "@/lib/security/mutation-guard";
import { clientIpFromRequest, takeRateLimit } from "@/lib/security/rate-limit";

const PLACEHOLDER = new Set(["KEINEN", "KEIN", "NONE", "NULL", "-", "N/A"]);

const schema = z.object({
  code: z.string().max(64).optional().nullable(),
  /** @deprecated dual fields — kept for compatibility */
  discountCode: z.string().max(64).optional().nullable(),
  giftCardCode: z.string().max(64).optional().nullable(),
});

function cleanCode(raw?: string | null) {
  const code = raw?.trim().toUpperCase() || "";
  if (!code || PLACEHOLDER.has(code)) return null;
  return code;
}

export async function POST(request: Request) {
  const guard = assertMutationAllowed(request);
  if (!guard.ok) {
    return NextResponse.json({ error: { code: guard.code } }, { status: 403 });
  }
  const ip = clientIpFromRequest(request);
  const limited = takeRateLimit({
    key: `promo:${ip}`,
    limit: 12,
    windowMs: 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED" } },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  try {
    const session = await getServerSession(authOptions);
    const sessionKey = await readCartSessionKeyFromRequest(request);
    const cart = await getOpenCart({ userId: session?.user?.id, sessionKey });
    const body = schema.parse(await request.json());

    const single = cleanCode(body.code);
    const discountRaw = single ?? cleanCode(body.discountCode);
    const giftRaw = single ? null : cleanCode(body.giftCardCode);

    const ticketsGrossCents = cart.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceGrossCents,
      0,
    );
    const eventIds = [...new Set(cart.items.map((i) => i.eventId))];

    let discountCode: string | null = null;
    let giftCardCode: string | null = null;
    const campaignActive = cartHasCampaignPrice(cart.items);

    if (single) {
      try {
        const d = await resolveDiscountCode({
          organizationId: cart.organizationId,
          code: single,
          ticketsGrossCents,
          eventIds,
        });
        if (d) {
          if (campaignActive) {
            return NextResponse.json(
              { error: { code: DISCOUNT_CAMPAIGN_ACTIVE } },
              { status: 400 },
            );
          }
          discountCode = d.code;
        } else {
          const g = await resolveGiftCard({
            organizationId: cart.organizationId,
            code: single,
            remainingPayableCents: ticketsGrossCents,
          });
          if (g) giftCardCode = g.code;
          else {
            return NextResponse.json({ error: { code: "CODE_NOT_FOUND" } }, { status: 400 });
          }
        }
      } catch (error) {
        // Discount existed but invalid for cart → try gift, else surface discount error
        try {
          const g = await resolveGiftCard({
            organizationId: cart.organizationId,
            code: single,
            remainingPayableCents: ticketsGrossCents,
          });
          if (g) giftCardCode = g.code;
          else {
            const message = error instanceof Error ? error.message : "CODE_NOT_FOUND";
            return NextResponse.json({ error: { code: message } }, { status: 400 });
          }
        } catch {
          const message = error instanceof Error ? error.message : "CODE_NOT_FOUND";
          return NextResponse.json({ error: { code: message } }, { status: 400 });
        }
      }
    } else {
      if (discountRaw) {
        if (campaignActive) {
          return NextResponse.json(
            { error: { code: DISCOUNT_CAMPAIGN_ACTIVE } },
            { status: 400 },
          );
        }
        try {
          const d = await resolveDiscountCode({
            organizationId: cart.organizationId,
            code: discountRaw,
            ticketsGrossCents,
            eventIds,
          });
          if (!d) {
            return NextResponse.json({ error: { code: "DISCOUNT_NOT_FOUND" } }, { status: 400 });
          }
          discountCode = d.code;
        } catch (error) {
          const message = error instanceof Error ? error.message : "DISCOUNT_NOT_FOUND";
          return NextResponse.json({ error: { code: message } }, { status: 400 });
        }
      }
      if (giftRaw) {
        try {
          const g = await resolveGiftCard({
            organizationId: cart.organizationId,
            code: giftRaw,
            remainingPayableCents: ticketsGrossCents,
          });
          if (!g) {
            return NextResponse.json({ error: { code: "GIFT_CARD_NOT_FOUND" } }, { status: 400 });
          }
          giftCardCode = g.code;
        } catch (error) {
          const message = error instanceof Error ? error.message : "GIFT_CARD_NOT_FOUND";
          return NextResponse.json({ error: { code: message } }, { status: 400 });
        }
      }
    }

    const updated = await prisma.cart.update({
      where: { id: cart.id },
      data: {
        discountCode,
        giftCardCode,
      },
      include: {
        items: {
          include: {
            category: {
              include: {
                event: { include: { location: true } },
                taxRate: true,
              },
            },
            hold: true,
          },
        },
      },
    });

    const summary = await priceCart(updated);
    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        discountCents: summary.discountCents,
        giftCardAppliedCents: summary.giftCardAppliedCents,
      },
    });

    const response = NextResponse.json({
      ok: true,
      sessionKey: updated.sessionKey,
      summary,
    });
    response.headers.append("Set-Cookie", cartCookieHeader(updated.sessionKey));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
