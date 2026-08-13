export type PriceCampaignType = "percent" | "fixed";
export type PriceCampaignChannel = "online" | "box_office" | "both";
/** unit = per-ticket Aktionspreis; order = once off cart when eligible qty ≥ minQuantity */
export type PriceCampaignApplyMode = "unit" | "order";

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
  /** Default unit for backwards compatibility */
  applyMode?: string;
  minQuantity?: number;
  badgeLabel?: string | null;
  badgeDisclaimer?: string | null;
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
  /** Public badge e.g. „Sommer-Rabatt - 10 EUR sparen“ */
  campaignBadgeLabel: string | null;
  campaignBadgeDisclaimer: string | null;
  /** ISO end of active campaign — for countdown UI */
  campaignValidUntil: string | null;
  accessibilityApplied: boolean;
  accessibilityLabel: string | null;
};

export type ResolvedOrderCampaignDiscount = {
  discountCents: number;
  campaignId: string;
  campaignName: string;
  label: string;
  badgeLabel: string | null;
  badgeDisclaimer: string | null;
  validUntil: string | null;
};

function clampNonNeg(n: number) {
  return Math.max(0, Math.round(n));
}

export function campaignApplyMode(campaign: Pick<PriceCampaignInput, "applyMode">): PriceCampaignApplyMode {
  return campaign.applyMode === "order" ? "order" : "unit";
}

export function campaignMinQuantity(
  campaign: Pick<PriceCampaignInput, "minQuantity" | "applyMode">,
): number {
  // Unit = Aktionspreis pro Ticket — minQuantity > 1 is a leftover from switching
  // applyMode in admin and must not hide the strike price on the event page.
  if (campaignApplyMode(campaign) === "unit") return 1;
  const n = campaign.minQuantity ?? 1;
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
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
 * Category eligibility. Empty `categoryIds` = orphaned links after category
 * recreate — treat as “all categories on this event” so the Aktion still shows.
 */
export function campaignAppliesToCategory(
  campaign: Pick<PriceCampaignInput, "categoryIds">,
  categoryId: string,
): boolean {
  if (!campaign.categoryIds || campaign.categoryIds.length === 0) return true;
  return campaign.categoryIds.includes(categoryId);
}

export function campaignAppliesToAnyCategory(
  campaign: Pick<PriceCampaignInput, "categoryIds">,
  categoryIds: string[],
): boolean {
  if (categoryIds.length === 0) return false;
  if (!campaign.categoryIds || campaign.categoryIds.length === 0) return true;
  return campaign.categoryIds.some((id) => categoryIds.includes(id));
}

/**
 * Among matching **unit** campaigns, pick the one with the largest absolute discount in cents.
 * Unit campaigns do not stack. Order-mode campaigns are ignored here.
 */
export function pickBestCampaign(input: {
  listCents: number;
  categoryId: string;
  channel: "online" | "box_office";
  now: Date;
  campaigns: PriceCampaignInput[];
  /** Line quantity — unit campaigns with minQuantity > 1 need this */
  quantity?: number;
}): PriceCampaignInput | null {
  const { listCents, categoryId, channel, now, campaigns } = input;
  const quantity = Math.max(1, input.quantity ?? 1);
  let best: PriceCampaignInput | null = null;
  let bestOff = -1;

  for (const c of campaigns) {
    if (campaignApplyMode(c) !== "unit") continue;
    if (!isCampaignActiveAt(c, now)) continue;
    if (!campaignMatchesChannel(c.channels, channel)) continue;
    if (!campaignAppliesToCategory(c, categoryId)) continue;
    if (quantity < campaignMinQuantity(c)) continue;
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
 * Resolve unit price: list → best unit campaign → optional accessibility offer.
 * Order-mode campaigns do not change unit price (applied in cart totals).
 */
export function resolveTicketUnitPrice(input: {
  listCents: number;
  categoryId: string;
  channel: "online" | "box_office";
  now?: Date;
  campaigns: PriceCampaignInput[];
  accessibility?: AccessibilityOfferInput | null;
  accessibilitySelected?: boolean;
  quantity?: number;
}): ResolvedTicketPrice {
  const now = input.now ?? new Date();
  const listCents = clampNonNeg(input.listCents);
  const best = pickBestCampaign({
    listCents,
    categoryId: input.categoryId,
    channel: input.channel,
    now,
    campaigns: input.campaigns,
    quantity: input.quantity,
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
    campaignBadgeLabel: best?.badgeLabel?.trim() || null,
    campaignBadgeDisclaimer: best?.badgeDisclaimer?.trim() || null,
    campaignValidUntil: best?.validUntil ? best.validUntil.toISOString() : null,
    accessibilityApplied: wantAccess && accessibilityDiscountCents > 0,
    accessibilityLabel: wantAccess ? offer?.label ?? null : null,
  };
}

/**
 * Active order-mode campaign for listing / event badge (no qty threshold yet).
 * Prefers campaigns with badgeLabel; otherwise first matching order campaign.
 */
export function pickActiveOrderCampaignBadge(input: {
  categoryIds: string[];
  channel: "online" | "box_office";
  now: Date;
  campaigns: PriceCampaignInput[];
}): PriceCampaignInput | null {
  const { categoryIds, channel, now, campaigns } = input;
  let best: PriceCampaignInput | null = null;
  for (const c of campaigns) {
    if (campaignApplyMode(c) !== "order") continue;
    if (!isCampaignActiveAt(c, now)) continue;
    if (!campaignMatchesChannel(c.channels, channel)) continue;
    if (!campaignAppliesToAnyCategory(c, categoryIds)) continue;
    if (!best || (c.badgeLabel && !best.badgeLabel)) best = c;
  }
  return best;
}

/**
 * Order-level campaign discount: once per cart (best absolute) when eligible qty ≥ minQuantity.
 * Eligible qty = sum of quantities for lines whose category is in the campaign.
 * Does not stack with other order campaigns (best wins). Unit campaigns are ignored.
 */
export function resolveOrderCampaignDiscount(input: {
  lines: Array<{
    eventId: string;
    categoryId: string;
    quantity: number;
    unitGrossCents: number;
  }>;
  campaignsByEventId: Map<string, PriceCampaignInput[]>;
  channel: "online" | "box_office";
  now?: Date;
}): ResolvedOrderCampaignDiscount | null {
  const now = input.now ?? new Date();
  let best: ResolvedOrderCampaignDiscount | null = null;

  for (const [eventId, campaigns] of input.campaignsByEventId) {
    const eventLines = input.lines.filter((l) => l.eventId === eventId);
    if (eventLines.length === 0) continue;

    for (const c of campaigns) {
      if (campaignApplyMode(c) !== "order") continue;
      if (!isCampaignActiveAt(c, now)) continue;
      if (!campaignMatchesChannel(c.channels, input.channel)) continue;

      const eligibleLines = eventLines.filter((l) => campaignAppliesToCategory(c, l.categoryId));
      const eligibleQty = eligibleLines.reduce((s, l) => s + l.quantity, 0);
      if (eligibleQty < campaignMinQuantity(c)) continue;

      const eligibleGross = eligibleLines.reduce(
        (s, l) => s + l.quantity * l.unitGrossCents,
        0,
      );
      if (eligibleGross <= 0) continue;

      let discountCents = 0;
      if (c.type === "fixed") {
        discountCents = Math.min(eligibleGross, clampNonNeg(c.value));
      } else if (c.type === "percent") {
        discountCents = Math.min(
          eligibleGross,
          clampNonNeg(Math.round((eligibleGross * c.value) / 10000)),
        );
      }
      if (discountCents <= 0) continue;

      const label =
        c.badgeLabel?.trim() ||
        c.name.trim() ||
        "Aktion";

      if (!best || discountCents > best.discountCents) {
        best = {
          discountCents,
          campaignId: c.id,
          campaignName: c.name,
          label,
          badgeLabel: c.badgeLabel ?? null,
          badgeDisclaimer: c.badgeDisclaimer ?? null,
          validUntil: c.validUntil.toISOString(),
        };
      }
    }
  }

  return best;
}

/** Whether any active campaign (unit or order) touches these categories — for anti-stack with codes. */
export function cartHasActivePriceCampaign(input: {
  lines: Array<{ eventId: string; categoryId: string; priceCampaignId?: string | null }>;
  campaignsByEventId: Map<string, PriceCampaignInput[]>;
  channel: "online" | "box_office";
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (input.lines.some((l) => Boolean(l.priceCampaignId))) return true;

  for (const line of input.lines) {
    const campaigns = input.campaignsByEventId.get(line.eventId) ?? [];
    for (const c of campaigns) {
      if (!isCampaignActiveAt(c, now)) continue;
      if (!campaignMatchesChannel(c.channels, input.channel)) continue;
      if (!campaignAppliesToCategory(c, line.categoryId)) continue;
      return true;
    }
  }
  return false;
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
  applyMode?: string | null;
  minQuantity?: number | null;
  badgeLabel?: string | null;
  badgeDisclaimer?: string | null;
  categories: { categoryId: string }[];
}): PriceCampaignInput {
  const applyMode = row.applyMode === "order" ? "order" : "unit";
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    type: row.type,
    value: row.value,
    channels: row.channels,
    applyMode,
    // Unit campaigns are always per-ticket; ignore leftover order thresholds.
    minQuantity: applyMode === "unit" ? 1 : Math.max(1, row.minQuantity ?? 1),
    badgeLabel: row.badgeLabel ?? null,
    badgeDisclaimer: row.badgeDisclaimer ?? null,
    categoryIds: row.categories.map((c) => c.categoryId),
  };
}
