import { Prisma } from "@prisma/client";
import type { Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = PrismaNS.TransactionClient;

/**
 * Atomically transition a hold out of `held` and decrement the pool once.
 * Prevents double-decrement races (expireSeatHolds + expireHolds, parallel carts).
 * Returns true when this caller applied the release.
 */
export async function releaseHeldQuantity(
  tx: Tx,
  hold: { id: string; poolId: string; quantity: number },
  nextStatus: "expired" | "released" | "consumed",
): Promise<boolean> {
  const updated = await tx.inventoryHold.updateMany({
    where: { id: hold.id, status: "held" },
    data: { status: nextStatus },
  });
  if (updated.count !== 1) return false;

  await tx.inventoryPool.update({
    where: { id: hold.poolId },
    data: { heldQuantity: { decrement: hold.quantity } },
  });
  // Never leave the counter negative after a race or stale counter.
  await tx.$executeRaw`
    UPDATE inventory_pools
    SET held_quantity = 0
    WHERE id = ${hold.poolId}::uuid AND held_quantity < 0
  `;
  return true;
}

/**
 * Rebuild heldQuantity from active holds so UI never shows stale/negative counts.
 * When poolIds is omitted, only pools with heldQuantity ≠ 0 (or any active holds) are checked.
 */
export async function reconcileHeldQuantities(poolIds?: string[]): Promise<number> {
  if (poolIds && poolIds.length === 0) return 0;

  const holdAgg = poolIds?.length
    ? await prisma.inventoryHold.groupBy({
        by: ["poolId"],
        where: { status: "held", poolId: { in: poolIds } },
        _sum: { quantity: true },
      })
    : await prisma.inventoryHold.groupBy({
        by: ["poolId"],
        where: { status: "held" },
        _sum: { quantity: true },
      });

  const byPool = new Map(
    holdAgg.map((r) => [r.poolId, r._sum.quantity ?? 0] as const),
  );

  const pools = await prisma.inventoryPool.findMany({
    where: poolIds?.length
      ? { id: { in: poolIds } }
      : {
          OR: [{ heldQuantity: { not: 0 } }, { id: { in: [...byPool.keys()] } }],
        },
    select: { id: true, heldQuantity: true },
  });

  let fixed = 0;
  for (const pool of pools) {
    const actual = byPool.get(pool.id) ?? 0;
    if (pool.heldQuantity === actual) continue;
    await prisma.inventoryPool.update({
      where: { id: pool.id },
      data: { heldQuantity: actual },
    });
    fixed += 1;
  }

  // Safety net for any leftover negatives.
  if (poolIds?.length) {
    await prisma.$executeRaw`
      UPDATE inventory_pools
      SET held_quantity = 0
      WHERE held_quantity < 0
        AND id IN (${Prisma.join(poolIds.map((id) => Prisma.sql`${id}::uuid`))})
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE inventory_pools
      SET held_quantity = 0
      WHERE held_quantity < 0
    `;
  }

  return fixed;
}
