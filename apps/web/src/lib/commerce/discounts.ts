import { prisma } from "@/lib/db";

export type DiscountComputation = {
  code: string;
  type: "percent" | "fixed";
  discountCents: number;
  label: string;
};

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
