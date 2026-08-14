import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type DiscountComputation = {
  code: string;
  type: "percent" | "fixed";
  discountCents: number;
  label: string;
};

export type GiftCardDebitPlan = {
  balanceAfterCents: number;
  status: "active" | "exhausted";
};

/** Pure helper — gift card balance after a single debit (or error). */
export function planGiftCardDebit(
  balanceCents: number,
  appliedCents: number,
): GiftCardDebitPlan {
  const applied = Math.max(0, Math.floor(appliedCents));
  if (applied <= 0) {
    return {
      balanceAfterCents: balanceCents,
      status: balanceCents <= 0 ? "exhausted" : "active",
    };
  }
  if (balanceCents < applied) {
    throw new Error("GIFT_CARD_INSUFFICIENT");
  }
  const balanceAfterCents = balanceCents - applied;
  return {
    balanceAfterCents,
    status: balanceAfterCents <= 0 ? "exhausted" : "active",
  };
}

export async function resolveDiscountCode(input: {
  organizationId: string;
  code: string;
  ticketsGrossCents: number;
  eventIds: string[];
}): Promise<DiscountComputation | null> {
  const normalized = input.code.trim().toUpperCase();
  if (!normalized) return null;

  const row = await prisma.discountCode.findFirst({
    where: {
      organizationId: input.organizationId,
      code: normalized,
      active: true,
    },
  });
  if (!row) return null;

  const now = new Date();
  if (row.validFrom && row.validFrom > now) throw new Error("DISCOUNT_NOT_YET_VALID");
  if (row.validUntil && row.validUntil < now) throw new Error("DISCOUNT_EXPIRED");
  if (row.maxRedemptions != null && row.redemptionCount >= row.maxRedemptions) {
    throw new Error("DISCOUNT_EXHAUSTED");
  }
  if (input.ticketsGrossCents < row.minOrderCents) throw new Error("DISCOUNT_MIN_ORDER");
  if (row.eventId && !input.eventIds.includes(row.eventId)) {
    throw new Error("DISCOUNT_WRONG_EVENT");
  }

  let discountCents = 0;
  if (row.type === "percent") {
    discountCents = Math.round((input.ticketsGrossCents * row.value) / 10000);
  } else {
    discountCents = Math.min(input.ticketsGrossCents, row.value);
  }

  return {
    code: row.code,
    type: row.type as "percent" | "fixed",
    discountCents,
    label:
      row.type === "percent"
        ? `Rabatt ${row.code} (${(row.value / 100).toFixed(2)} %)`
        : `Rabatt ${row.code}`,
  };
}

export async function resolveGiftCard(input: {
  organizationId: string;
  code: string;
  remainingPayableCents: number;
}) {
  const normalized = input.code.trim().toUpperCase();
  if (!normalized) return null;

  const card = await prisma.giftCard.findFirst({
    where: { organizationId: input.organizationId, code: normalized, status: "active" },
  });
  if (!card) return null;
  if (card.expiresAt && card.expiresAt < new Date()) throw new Error("GIFT_CARD_EXPIRED");
  if (card.balanceCents <= 0) throw new Error("GIFT_CARD_EMPTY");

  const applied = Math.min(card.balanceCents, Math.max(0, input.remainingPayableCents));
  return {
    code: card.code,
    appliedCents: applied,
    balanceAfter: card.balanceCents - applied,
    cardId: card.id,
  };
}

type PromoOrder = {
  id: string;
  organizationId: string;
  discountCode: string | null;
  giftCardCode: string | null;
  giftCardAppliedCents: number;
  promotionsReservedAt?: Date | null;
};

async function applyOrderPromotions(
  tx: Prisma.TransactionClient,
  order: PromoOrder,
): Promise<{ discountRedeemed: boolean; giftCardDebitedCents: number }> {
  let discountRedeemed = false;
  let giftCardDebitedCents = 0;

  const discountCode = order.discountCode?.trim().toUpperCase() || null;
  if (discountCode) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        redemption_count: number;
        max_redemptions: number | null;
        active: boolean;
      }>
    >`
      SELECT id, redemption_count, max_redemptions, active
      FROM discount_codes
      WHERE organization_id = ${order.organizationId}::uuid
        AND code = ${discountCode}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row || !row.active) {
      throw new Error("DISCOUNT_NOT_FOUND");
    }
    if (row.max_redemptions != null && row.redemption_count >= row.max_redemptions) {
      throw new Error("DISCOUNT_EXHAUSTED");
    }
    await tx.discountCode.update({
      where: { id: row.id },
      data: { redemptionCount: { increment: 1 } },
    });
    discountRedeemed = true;
  }

  const giftCode = order.giftCardCode?.trim().toUpperCase() || null;
  const applied = Math.max(0, Math.floor(order.giftCardAppliedCents || 0));
  if (giftCode && applied > 0) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        balance_cents: number;
        status: string;
        expires_at: Date | null;
      }>
    >`
      SELECT id, balance_cents, status, expires_at
      FROM gift_cards
      WHERE organization_id = ${order.organizationId}::uuid
        AND code = ${giftCode}
      FOR UPDATE
    `;
    const card = rows[0];
    if (!card) {
      throw new Error("GIFT_CARD_NOT_FOUND");
    }
    if (card.status !== "active") {
      throw new Error("GIFT_CARD_INACTIVE");
    }
    if (card.expires_at && card.expires_at < new Date()) {
      throw new Error("GIFT_CARD_EXPIRED");
    }
    const plan = planGiftCardDebit(card.balance_cents, applied);
    await tx.giftCard.update({
      where: { id: card.id },
      data: {
        balanceCents: plan.balanceAfterCents,
        status: plan.status,
      },
    });
    giftCardDebitedCents = applied;
  }

  return { discountRedeemed, giftCardDebitedCents };
}

/**
 * Hard-lock limited codes / gift-card balance at checkout (before Stripe).
 * Idempotent via `promotionsReservedAt`.
 */
export async function reserveOrderPromotions(
  tx: Prisma.TransactionClient,
  order: PromoOrder,
): Promise<{ discountRedeemed: boolean; giftCardDebitedCents: number }> {
  if (order.promotionsReservedAt) {
    return { discountRedeemed: Boolean(order.discountCode), giftCardDebitedCents: 0 };
  }
  const result = await applyOrderPromotions(tx, order);
  await tx.order.update({
    where: { id: order.id },
    data: { promotionsReservedAt: new Date() },
  });
  return result;
}

/**
 * Undo a checkout reservation when payment fails / order is cancelled unpaid.
 */
export async function releaseOrderPromotions(
  tx: Prisma.TransactionClient,
  order: PromoOrder,
): Promise<void> {
  if (!order.promotionsReservedAt) return;

  const discountCode = order.discountCode?.trim().toUpperCase() || null;
  if (discountCode) {
    const rows = await tx.$queryRaw<Array<{ id: string; redemption_count: number }>>`
      SELECT id, redemption_count
      FROM discount_codes
      WHERE organization_id = ${order.organizationId}::uuid
        AND code = ${discountCode}
      FOR UPDATE
    `;
    const row = rows[0];
    if (row && row.redemption_count > 0) {
      await tx.discountCode.update({
        where: { id: row.id },
        data: { redemptionCount: { decrement: 1 } },
      });
    }
  }

  const giftCode = order.giftCardCode?.trim().toUpperCase() || null;
  const applied = Math.max(0, Math.floor(order.giftCardAppliedCents || 0));
  if (giftCode && applied > 0) {
    const rows = await tx.$queryRaw<
      Array<{ id: string; balance_cents: number; status: string }>
    >`
      SELECT id, balance_cents, status
      FROM gift_cards
      WHERE organization_id = ${order.organizationId}::uuid
        AND code = ${giftCode}
      FOR UPDATE
    `;
    const card = rows[0];
    if (card) {
      const restored = card.balance_cents + applied;
      await tx.giftCard.update({
        where: { id: card.id },
        data: {
          balanceCents: restored,
          status: restored > 0 ? "active" : card.status,
        },
      });
    }
  }

  await tx.order.update({
    where: { id: order.id },
    data: { promotionsReservedAt: null },
  });
}

/**
 * Atomically redeem discount + debit gift card for a paid order.
 * If checkout already reserved, this is a no-op (no double-debit).
 * Legacy in-flight orders without reservation still redeem here.
 */
export async function redeemOrderPromotions(
  tx: Prisma.TransactionClient,
  order: PromoOrder,
): Promise<{ discountRedeemed: boolean; giftCardDebitedCents: number }> {
  if (order.promotionsReservedAt) {
    return { discountRedeemed: Boolean(order.discountCode), giftCardDebitedCents: 0 };
  }
  const result = await applyOrderPromotions(tx, order);
  await tx.order.update({
    where: { id: order.id },
    data: { promotionsReservedAt: new Date() },
  });
  return result;
}
