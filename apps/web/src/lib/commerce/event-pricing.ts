export type PriceCampaignType = "percent" | "fixed";
export type PriceCampaignChannel = "online" | "box_office" | "both";

export type PriceCampaignInput = {
  id: string;
  name: string;
  active: boolean;
  validFrom: Date;
  validUntil: Date;
  type: string;
  value: number;
  channels: string;
  categoryIds: string[];
};

export type AccessibilityOfferInput = {
  enabled: boolean;
  label: string;
  description?: string | null;
  type: string;
  value: number;
};

export type ResolvedTicketPrice = {
  listCents: number;
  unitCents: number;
  campaignDiscountCents: number;
  accessibilityDiscountCents: number;
  campaignId: string | null;
  campaignName: string | null;
  accessibilityApplied: boolean;
  accessibilityLabel: string | null;
};

function clampNonNeg(n: number) {
  return Math.max(0, Math.round(n));
}

/** Apply percent (bps) or fixed cents off a gross price. */
export function applyDiscountOff(listCents: number, type: string, value: number): number {
  const list = clampNonNeg(listCents);
  if (value <= 0) return list;
  if (type === "percent") {
    return clampNonNeg(list - Math.round((list * value) / 10000));
  }
  if (type === "fixed") {
    return clampNonNeg(list - value);
  }
  return list;
}

export function campaignMatchesChannel(
  channels: string,
  channel: "online" | "box_office",
): boolean {
  const c = (channels || "both").toLowerCase();
  if (c === "both") return true;
  return c === channel;
}

export function isCampaignActiveAt(
  campaign: Pick<PriceCampaignInput, "active" | "validFrom" | "validUntil">,
  now: Date,
): boolean {
  if (!campaign.active) return false;
  return campaign.validFrom <= now && campaign.validUntil >= now;
}

/**
 * Among matching campaigns, pick the one with the largest absolute discount in cents.
 * Campaigns do not stack.
 */
export function pickBestCampaign(input: {
  listCents: number;
  categoryId: string;
  channel: "online" | "box_office";
  now: Date;
  campaigns: PriceCampaignInput[];
}): PriceCampaignInput | null {
  const { listCents, categoryId, channel, now, campaigns } = input;
  let best: PriceCampaignInput | null = null;
  let bestOff = -1;

  for (const c of campaigns) {
    if (!isCampaignActiveAt(c, now)) continue;
    if (!campaignMatchesChannel(c.channels, channel)) continue;
    if (!c.categoryIds.includes(categoryId)) continue;
    const after = applyDiscountOff(listCents, c.type, c.value);
    const off = listCents - after;
    if (off > bestOff) {
      bestOff = off;
      best = c;
    }
  }
  return best;
}

/**
 * Resolve unit price: list → best campaign → optional accessibility offer.
 */
export function resolveTicketUnitPrice(input: {
  listCents: number;
  categoryId: string;
  channel: "online" | "box_office";
  now?: Date;
  campaigns: PriceCampaignInput[];
  accessibility?: AccessibilityOfferInput | null;
  accessibilitySelected?: boolean;
}): ResolvedTicketPrice {
  const now = input.now ?? new Date();
  const listCents = clampNonNeg(input.listCents);
  const best = pickBestCampaign({
    listCents,
    categoryId: input.categoryId,
    channel: input.channel,
    now,
    campaigns: input.campaigns,
  });

  let afterCampaign = listCents;
  let campaignDiscountCents = 0;
  if (best) {
    afterCampaign = applyDiscountOff(listCents, best.type, best.value);
    campaignDiscountCents = listCents - afterCampaign;
  }

  const offer = input.accessibility;
  const wantAccess = Boolean(input.accessibilitySelected && offer?.enabled && offer.value > 0);
  let unitCents = afterCampaign;
  let accessibilityDiscountCents = 0;
  if (wantAccess && offer) {
    unitCents = applyDiscountOff(afterCampaign, offer.type, offer.value);
    accessibilityDiscountCents = afterCampaign - unitCents;
  }

  return {
    listCents,
    unitCents,
    campaignDiscountCents,
    accessibilityDiscountCents,
    campaignId: best?.id ?? null,
    campaignName: best?.name ?? null,
    accessibilityApplied: wantAccess && accessibilityDiscountCents > 0,
    accessibilityLabel: wantAccess ? offer?.label ?? null : null,
  };
}

export function mapCampaignRow(row: {
  id: string;
  name: string;
  active: boolean;
  validFrom: Date;
  validUntil: Date;
  type: string;
  value: number;
  channels: string;
  categories: { categoryId: string }[];
}): PriceCampaignInput {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    type: row.type,
    value: row.value,
    channels: row.channels,
    categoryIds: row.categories.map((c) => c.categoryId),
  };
}
