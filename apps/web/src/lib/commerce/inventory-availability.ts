import type { Prisma } from "@prisma/client";

/** Minimal pool shape for shared / per-channel availability. */
export type InventoryPoolQty = {
  id?: string;
  channel?: string;
  capacity: number;
  soldQuantity: number;
  heldQuantity: number;
};

/**
 * Physical / category Kontingent is shared across Online, Tageskasse, etc.
 * Each InventoryPool may still have a channel cap (≤ category capacity), but
 * pool capacities must never be summed — that double-counts seats.
 */
export function categoryInventoryCapacity(
  categoryCapacity: number,
  pools: { capacity: number }[],
): number {
  if (categoryCapacity > 0) return categoryCapacity;
  return Math.max(0, ...pools.map((p) => p.capacity), 0);
}

export function sharedCommittedQuantity(pools: InventoryPoolQty[]): number {
  return pools.reduce((s, p) => s + p.soldQuantity + p.heldQuantity, 0);
}

/** Tickets still sellable for the category as a whole (all channels). */
export function sharedRemainingQuantity(
  pools: InventoryPoolQty[],
  categoryCapacity: number,
): number {
  const cap = categoryInventoryCapacity(categoryCapacity, pools);
  return Math.max(0, cap - sharedCommittedQuantity(pools));
}

/**
 * How many units this channel may still sell/hold.
 * = min(channel pool remaining, shared remaining across all pools).
 */
export function channelAvailableQuantity(
  pools: InventoryPoolQty[],
  channel: string,
  categoryCapacity: number,
): number {
  const shared = sharedRemainingQuantity(pools, categoryCapacity);
  const pool = pools.find((p) => p.channel === channel);
  if (!pool) return shared;
  const channelLocal = Math.max(0, pool.capacity - pool.soldQuantity - pool.heldQuantity);
  return Math.min(channelLocal, shared);
}

type LockedPoolRow = {
  id: string;
  channel: string;
  capacity: number;
  soldQuantity: number;
  heldQuantity: number;
};

/**
 * Lock all inventory pools for a category (FOR UPDATE) so Online and Tageskasse
 * cannot oversell the shared Kontingent concurrently.
 */
export async function lockCategoryInventoryPools(
  tx: Prisma.TransactionClient,
  categoryId: string,
): Promise<LockedPoolRow[]> {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      channel: string;
      capacity: number;
      sold_quantity: number;
      held_quantity: number;
    }>
  >`
    SELECT id, channel, capacity, sold_quantity, held_quantity
    FROM inventory_pools
    WHERE category_id = ${categoryId}::uuid
    ORDER BY channel ASC
    FOR UPDATE
  `;
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    capacity: r.capacity,
    soldQuantity: r.sold_quantity,
    heldQuantity: r.held_quantity,
  }));
}
