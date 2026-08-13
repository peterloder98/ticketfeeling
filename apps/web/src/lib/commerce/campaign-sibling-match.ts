/** Shared fingerprint for linking Preisaktionen across tour sibling events. */

export type CampaignMatchFields = {
  campaignGroupId?: string | null;
  name: string;
  type: string;
  value: number;
  channels: string;
  applyMode: string;
  minQuantity: number;
  badgeLabel?: string | null;
  validFrom: Date | string;
};

function normBadge(label: string | null | undefined) {
  const t = label?.trim() ?? "";
  return t.length > 0 ? t : null;
}

function validFromMs(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  return d.getTime();
}

function contentFingerprint(a: CampaignMatchFields, b: CampaignMatchFields, withValidFrom: boolean) {
  const base =
    a.name.trim() === b.name.trim() &&
    a.type === b.type &&
    a.value === b.value &&
    a.channels === b.channels &&
    (a.applyMode === "order" ? "order" : "unit") === (b.applyMode === "order" ? "order" : "unit") &&
    Math.max(1, a.minQuantity ?? 1) === Math.max(1, b.minQuantity ?? 1) &&
    normBadge(a.badgeLabel) === normBadge(b.badgeLabel);
  if (!base) return false;
  if (!withValidFrom) return true;
  return validFromMs(a.validFrom) === validFromMs(b.validFrom);
}

/**
 * Match by campaignGroupId when both have one; otherwise by content
 * (name, type, amount, channels, applyMode, minQty, badge [, validFrom]).
 * validUntil is ignored — siblings may clamp end dates to their event end.
 * validFrom is preferred but not required for legacy rows without a group id.
 */
export function campaignsMatch(a: CampaignMatchFields, b: CampaignMatchFields): boolean {
  const groupA = a.campaignGroupId?.trim() || null;
  const groupB = b.campaignGroupId?.trim() || null;
  if (groupA && groupB) return groupA === groupB;

  if (contentFingerprint(a, b, true)) return true;
  // Legacy / partially edited siblings: same offer without exact validFrom.
  return contentFingerprint(a, b, false);
}
