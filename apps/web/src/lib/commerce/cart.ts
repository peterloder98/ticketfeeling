import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { createSecureToken } from "@/lib/crypto-token";
import { readCartSessionKey, resolveCartSessionKey } from "@/lib/commerce/cart-session";
import { CART_HOLD_MS } from "@/lib/cart-countdown";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";
import { Prisma } from "@prisma/client";

/** Keep in sync with cart-countdown CART_HOLD_MS — countdown is driven by cart.expiresAt. */
const HOLD_MINUTES = CART_HOLD_MS / (60 * 1000);

/** Avoid running expire on every cart badge poll (focus/nav). */
let lastExpireMs = 0;
const EXPIRE_THROTTLE_MS = 15_000;

async function expireHolds(now = new Date(), opts?: { forceSeatExpire?: boolean }) {
  const { expireSeatHolds } = await import("@/lib/seating/materialize");
  const { releaseHeldQuantity, reconcileHeldQuantities } = await import(
    "@/lib/commerce/hold-quantity"
  );
  await expireSeatHolds(now, opts?.forceSeatExpire ? { force: true } : undefined);

  const expired = await prisma.inventoryHold.findMany({
    where: { status: "held", expiresAt: { lt: now } },
    select: {
      id: true,
      poolId: true,
      quantity: true,
      cartItemId: true,
      orderId: true,
      cartItem: {
        select: {
          cart: {
            select: {
              status: true,
              orders: {
                select: { paymentStatus: true, status: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  const touchedPools = new Set<string>();
  if (expired.length > 0) {
    // One transaction instead of N — each remote RTT used to add ~100–300ms.
    await prisma.$transaction(async (tx) => {
      for (const hold of expired) {
        // Protect holds tied to orders awaiting async payment (SEPA processing).
        const order = hold.cartItem?.cart?.orders?.[0];
        const paymentStatus = order?.paymentStatus;
        if (
          hold.orderId ||
          (hold.cartItem?.cart?.status === "converted" &&
            (paymentStatus === "pending" || paymentStatus === "processing"))
        ) {
          continue;
        }

        const applied = await releaseHeldQuantity(tx, hold, "expired");
        if (!applied) continue;
        touchedPools.add(hold.poolId);
        if (hold.cartItemId) {
          await tx.eventSeat.updateMany({
            where: { cartItemId: hold.cartItemId, status: "held" },
            data: { status: "available", holdExpiresAt: null, cartItemId: null },
          });
        }
      }
    });
  }

  // Repair stale/negative counters (e.g. prior double-decrements).
  await reconcileHeldQuantities(
    touchedPools.size > 0 ? [...touchedPools] : undefined,
  ).catch((error) => {
    console.error("[cart] heldQuantity reconcile failed", error);
  });
}

/** Public entry for admin pages / jobs — expire seats + inventory, then reconcile. */
export async function expireAndReconcileHolds(
  now = new Date(),
  opts?: { forceSeatExpire?: boolean },
) {
  await expireHolds(now, opts);
}

async function expireHoldsThrottled() {
  const t = Date.now();
  if (t - lastExpireMs < EXPIRE_THROTTLE_MS) return;
  lastExpireMs = t;
  await expireHolds();
}

/** Never block cart reads/writes on hold cleanup — run in background. */
function scheduleExpireHolds() {
  void expireHoldsThrottled().catch((error) => {
    console.error("[cart] background expire failed", error);
  });
}

const cartInclude = {
  items: {
    include: {
      category: {
        include: {
          event: {
            include: { location: true },
          },
          taxRate: true,
        },
      },
      hold: true,
      seats: {
        orderBy: [{ blockLabel: "asc" }, { rowIndex: "asc" }, { seatIndex: "asc" }],
      },
    },
  },
} satisfies Prisma.CartInclude;

export type OpenCart = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function freshExpiresAt() {
  return new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
}

async function renewCartInPlace(
  cartId: string,
  userId?: string | null,
) {
  await releaseCartHolds(cartId);
  await prisma.cartItem.deleteMany({ where: { cartId } });
  return prisma.cart.update({
    where: { id: cartId },
    data: {
      status: "open",
      expiresAt: freshExpiresAt(),
      userId: userId ?? undefined,
      discountCode: null,
      discountCents: 0,
      giftCardCode: null,
      giftCardAppliedCents: 0,
    },
    include: cartInclude,
  });
}

/** Header badge: no cart create, no mint, no full pricing — count only if session exists. */
export async function peekCartItemCount(opts?: {
  userId?: string | null;
  sessionKey?: string | null;
}): Promise<{ itemCount: number; expiresAt: Date | null; sessionKey: string | null }> {
  scheduleExpireHolds();
  const org = await getDefaultOrganization();
  if (!org) return { itemCount: 0, expiresAt: null, sessionKey: null };

  // Never mint on peek — that used to overwrite a real cart cookie with an empty session.
  const sessionKey = opts?.sessionKey?.trim() || (await readCartSessionKey());
  if (!sessionKey) {
    return { itemCount: 0, expiresAt: null, sessionKey: null };
  }

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
      sessionKey: true,
      items: { select: { quantity: true } },
    },
  });

  if (!cart || cart.status !== "open" || cart.expiresAt < now) {
    return { itemCount: 0, expiresAt: null, sessionKey: cart?.sessionKey ?? sessionKey };
  }

  return {
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    expiresAt: cart.expiresAt,
    sessionKey: cart.sessionKey,
  };
}

/** Read-only: never mint a session or create an empty cart. */
export async function findOpenCart(opts?: {
  userId?: string | null;
  sessionKey?: string | null;
}): Promise<OpenCart | null> {
  scheduleExpireHolds();
  // EventSeat include selects category_id — patch DB before Prisma queries seats.
  // Schema ensure is memoized; run in parallel with org lookup on cold paths.
  const [, org] = await Promise.all([
    ensureSeatingAssignmentSchema(prisma),
    getDefaultOrganization(),
  ]);
  if (!org) return null;

  const sessionKey = opts?.sessionKey?.trim() || (await readCartSessionKey());
  if (!sessionKey) return null;

  const now = new Date();
  const cart = await prisma.cart.findUnique({
    where: {
      organizationId_sessionKey: {
        organizationId: org.id,
        sessionKey,
      },
    },
    include: cartInclude,
  });

  if (!cart || cart.status !== "open" || cart.expiresAt < now) {
    return null;
  }

  if (opts?.userId && !cart.userId) {
    return prisma.cart.update({
      where: { id: cart.id },
      data: { userId: opts.userId },
      include: cartInclude,
    });
  }
  return cart;
}

export async function getOpenCart(opts?: {
  userId?: string | null;
  sessionKey?: string | null;
  /** When false, never mint/create — returns null instead (SSR read paths). */
  createIfMissing?: boolean;
}): Promise<OpenCart> {
  if (opts?.createIfMissing === false) {
    const found = await findOpenCart(opts);
    if (!found) throw new Error("CART_NOT_FOUND");
    return found;
  }

  scheduleExpireHolds();
  // EventSeat include selects category_id — patch DB before Prisma queries seats.
  const [, org] = await Promise.all([
    ensureSeatingAssignmentSchema(prisma),
    getDefaultOrganization(),
  ]);
  if (!org) throw new Error("NO_ORGANIZATION");
  const sessionKey = await resolveCartSessionKey(opts?.sessionKey);
  const now = new Date();

  const cart = await prisma.cart.findUnique({
    where: {
      organizationId_sessionKey: {
        organizationId: org.id,
        sessionKey,
      },
    },
    include: cartInclude,
  });

  // Active open cart → reuse (and optionally attach user)
  if (cart?.status === "open" && cart.expiresAt >= now) {
    if (opts?.userId && !cart.userId) {
      return prisma.cart.update({
        where: { id: cart.id },
        data: { userId: opts.userId },
        include: cartInclude,
      });
    }
    return cart;
  }

  // Expired / marked expired with same session → reopen in place (unique on session_key)
  if (cart && (cart.status === "expired" || cart.status === "open")) {
    return renewCartInPlace(cart.id, opts?.userId ?? cart.userId);
  }

  // Converted checkout cart keeps the cookie session_key → free it, then create a new open cart
  if (cart && cart.status === "converted") {
    await prisma.cart.update({
      where: { id: cart.id },
      data: { sessionKey: `converted:${cart.id}:${createSecureToken(8)}` },
    });
  }

  try {
    return await prisma.cart.create({
      data: {
        organizationId: org.id,
        userId: opts?.userId ?? null,
        sessionKey,
        status: "open",
        expiresAt: freshExpiresAt(),
      },
      include: cartInclude,
    });
  } catch (error) {
    // Parallel requests: unique race — load and reopen
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.cart.findUnique({
        where: {
          organizationId_sessionKey: {
            organizationId: org.id,
            sessionKey,
          },
        },
        include: cartInclude,
      });
      if (existing?.status === "open" && existing.expiresAt >= new Date()) {
        return existing;
      }
      if (existing) {
        return renewCartInPlace(existing.id, opts?.userId ?? existing.userId);
      }
    }
    throw error;
  }
}

async function releaseCartHolds(cartId: string) {
  const items = await prisma.cartItem.findMany({
    where: { cartId },
    include: { hold: true },
  });
  if (items.length === 0) return;
  const { releaseHeldQuantity } = await import("@/lib/commerce/hold-quantity");
  // One transaction — N separate txs used to cost one RTT each.
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      if (item.hold?.status === "held") {
        await releaseHeldQuantity(tx, item.hold, "released");
      }
      await tx.eventSeat.updateMany({
        where: { cartItemId: item.id, status: "held" },
        data: { status: "available", holdExpiresAt: null, cartItemId: null },
      });
    }
  });
}

export async function addToCart(input: {
  categoryId: string;
  quantity: number;
  userId?: string | null;
  sessionKey?: string | null;
  /** best_available | seat_map — only when event has reserved seating */
  seatingMode?: "best_available" | "seat_map" | "free";
  /** Required when seatingMode === seat_map */
  seatIds?: string[];
  /** Optional reduced fare / wheelchair self-select when event offer is enabled */
  accessibilitySelected?: boolean;
}) {
  if (input.quantity < 1) throw new Error("INVALID_QUANTITY");

  const [cart, category] = await Promise.all([
    getOpenCart({ userId: input.userId, sessionKey: input.sessionKey }),
    prisma.eventTicketCategory.findUnique({
      where: { id: input.categoryId },
      include: {
        event: {
          include: {
            tour: { select: { coverImageUrl: true, visibility: true } },
          },
        },
        taxRate: true,
        pools: true,
      },
    }),
  ]);
  if (!category || category.status !== "active" || !category.onlineBookable) {
    throw new Error("CATEGORY_UNAVAILABLE");
  }
  if (category.event.organizationId !== cart.organizationId) {
    throw new Error("ORG_MISMATCH");
  }

  // Soft-block multi-event carts — one event per order (#17).
  if (cart.items.length > 0) {
    const existingEventId = cart.items[0]?.eventId;
    if (existingEventId && existingEventId !== category.eventId) {
      throw new Error("MULTI_EVENT_CART");
    }
  }

  const now = new Date();
  const { isEventSaleOpen, isCategorySaleWindowOpen } = await import("@/lib/commerce/event-sale");
  if (!isEventSaleOpen(category.event, now) || !isCategorySaleWindowOpen(category, now)) {
    throw new Error("SALE_CLOSED");
  }

  if (input.quantity < category.minPerOrder || input.quantity > category.maxPerOrder) {
    throw new Error("QUANTITY_LIMIT");
  }

  const { loadEventPriceCampaigns, accessibilityOfferFromEvent } = await import(
    "@/lib/commerce/load-event-pricing"
  );
  const { resolveTicketUnitPrice } = await import("@/lib/commerce/event-pricing");
  const campaigns = await loadEventPriceCampaigns(category.eventId);
  const accessibility = accessibilityOfferFromEvent(category.event);
  const accessibilitySelected = Boolean(input.accessibilitySelected && accessibility.enabled);
  const pricedUnit = resolveTicketUnitPrice({
    listCents: category.priceGrossCents,
    categoryId: category.id,
    channel: "online",
    now,
    campaigns,
    accessibility,
    accessibilitySelected,
  });

  const { categoryNeedsSeats, seatsPerTicket } = await import("@/lib/seating/types");
  const { ensureEventSeatsIfNeeded } = await import("@/lib/seating/materialize");
  const {
    pickBestAvailableSeats,
    pickBestAvailablePairs,
    assignCompanionSeats,
    validateSeatSelection,
    computeOccupancyPercent,
  } = await import("@/lib/seating/best-available");
  const { parseSeatOptimizationSettings } = await import(
    "@/lib/seating/seat-optimization-settings"
  );

  const needsSeats = categoryNeedsSeats({
    seatingBookingMode: category.event.seatingBookingMode,
    categoryKind: category.categoryKind,
    freeSeating: category.freeSeating,
  });
  const companionFree =
    category.categoryKind === "wheelchair" && Boolean(category.companionFree);
  const seatSlots = input.quantity * seatsPerTicket({
    categoryKind: category.categoryKind,
    companionFree,
  });

  let seatingMode: "best_available" | "seat_map" | "free" = input.seatingMode ?? "free";
  if (needsSeats) {
    if (category.event.seatingBookingMode === "best_available") {
      seatingMode = "best_available";
    } else if (seatingMode === "free") {
      seatingMode = "best_available";
    }
    await ensureEventSeatsIfNeeded(category.eventId);
  } else {
    seatingMode = "free";
  }

  if (needsSeats && seatingMode === "seat_map") {
    // Customer picks wheelchair / primary seats only; companions are assigned adjacent.
    if (!input.seatIds?.length || input.seatIds.length !== input.quantity) {
      throw new Error("SEATS_REQUIRED");
    }
  }

  const pool =
    category.pools.find((p) => p.channel === "online") ??
    (await prisma.inventoryPool.create({
      data: {
        eventId: category.eventId,
        categoryId: category.id,
        channel: "online",
        capacity: Math.max(0, category.capacity - category.safetyReserve),
      },
    }));

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

  const seatSelect = {
    id: true,
    seatKey: true,
    blockObjectId: true,
    blockLabel: true,
    rowIndex: true,
    seatIndex: true,
    rowLabel: true,
    seatNumber: true,
    status: true,
    categoryId: true,
    locked: true,
    segmentIndex: true,
    positionInSegment: true,
    seatType: true,
  } as const;

  const seatOptSettings = parseSeatOptimizationSettings(
    category.event as {
      seatOptPreferContiguous?: boolean;
      seatOptPreventNewSingletons?: boolean;
      seatOptIntelligentRemnants?: boolean;
      seatOptGapRelaxOccupancyPercent?: number;
    },
  );

  // Holds: compute → revalidate → atomic claim; retry Bestplatz on concurrent conflict.
  const MAX_SEAT_CLAIM_ATTEMPTS = 3;
  let lastSeatError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_SEAT_CLAIM_ATTEMPTS; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
    const {
      assertSufficientStock,
      channelAvailableQuantity,
      lockCategoryInventoryPools,
    } = await import("@/lib/commerce/inventory-availability");
    const {
      assignedUnlockedSeatCounts,
      isPlanBackedTicketCategory,
      resolveSellableCategoryCapacity,
    } = await import("@/lib/seating/sync-category-capacity");

    const lockedPools = await lockCategoryInventoryPools(tx, category.id);
    const planBacked = isPlanBackedTicketCategory({
      freeSeating: category.freeSeating,
      categoryKind: category.categoryKind,
      seatingBookingMode: category.event.seatingBookingMode,
    });
    let assignedCount: number | null = null;
    if (planBacked) {
      const counts = await assignedUnlockedSeatCounts(tx, category.eventId, [category.id]);
      assignedCount = counts[category.id] ?? 0;
    }
    const sellableCapacity = resolveSellableCategoryCapacity({
      categoryCapacity: category.capacity,
      categoryKind: category.categoryKind,
      freeSeating: category.freeSeating,
      seatingBookingMode: category.event.seatingBookingMode,
      assignedUnlockedSeatCount: assignedCount,
    });
    const available = channelAvailableQuantity(lockedPools, "online", sellableCapacity);
    assertSufficientStock(available, input.quantity);

    let seatIdsToHold: string[] = [];
    if (needsSeats) {
      // Once any seat is category-assigned, only that category's unlocked seats sell.
      const assignedCount = await tx.eventSeat.count({
        where: { eventId: category.eventId, categoryId: { not: null } },
      });
      const categoryFilter =
        assignedCount > 0
          ? { categoryId: category.id }
          : ({} as { categoryId?: string });

      const sellableWhere = {
        eventId: category.eventId,
        status: "available" as const,
        locked: false,
        ...categoryFilter,
      };

      // Occupancy over all unlocked seats for this event (or category when assigned).
      const occupancyPool = await tx.eventSeat.findMany({
        where: {
          eventId: category.eventId,
          locked: false,
          ...categoryFilter,
          seatKey: { not: { contains: ":ST:" } },
        },
        select: { status: true, locked: true },
      });
      const occupancyPercent = computeOccupancyPercent(occupancyPool);
      const optCtx = { settings: seatOptSettings, occupancyPercent };

      if (seatingMode === "seat_map") {
        const requested = await tx.eventSeat.findMany({
          where: {
            id: { in: input.seatIds! },
            ...sellableWhere,
          },
          select: seatSelect,
        });
        if (requested.length !== input.quantity) throw new Error("SEATS_UNAVAILABLE");

        // Validate gap rule against the full category pool (including requested).
        const poolForValidation = await tx.eventSeat.findMany({
          where: {
            eventId: category.eventId,
            locked: false,
            ...categoryFilter,
            seatKey: { not: { contains: ":ST:" } },
          },
          select: seatSelect,
        });
        const validation = validateSeatSelection(
          poolForValidation,
          requested.map((s) => s.id),
          optCtx,
        );
        if (!validation.ok) {
          throw new Error(validation.code);
        }

        if (companionFree) {
          const poolSeats = await tx.eventSeat.findMany({
            where: sellableWhere,
            select: seatSelect,
          });
          const withCompanions = assignCompanionSeats(requested, poolSeats);
          if (!withCompanions || withCompanions.length !== seatSlots) {
            throw new Error("COMPANION_SEAT_UNAVAILABLE");
          }
          seatIdsToHold = withCompanions.map((s) => s.id);
        } else {
          seatIdsToHold = requested.map((s) => s.id);
        }
      } else {
        const all = await tx.eventSeat.findMany({
          where: sellableWhere,
          select: seatSelect,
        });
        if (companionFree) {
          const picked = pickBestAvailablePairs(all, input.quantity, optCtx);
          if (picked.length !== seatSlots) throw new Error("SEATS_UNAVAILABLE");
          seatIdsToHold = picked.map((s) => s.id);
        } else {
          const picked = pickBestAvailableSeats(all, input.quantity, optCtx);
          if (picked.length !== input.quantity) throw new Error("SEATS_UNAVAILABLE");
          seatIdsToHold = picked.map((s) => s.id);
        }
      }
    }

    await tx.inventoryPool.update({
      where: { id: pool.id },
      data: {
        heldQuantity: { increment: input.quantity },
        version: { increment: 1 },
      },
    });

    // Merge into an existing line when category + unit price + accessibility match.
    const existingItem = await tx.cartItem.findFirst({
      where: {
        cartId: cart.id,
        categoryId: category.id,
        unitPriceGrossCents: pricedUnit.unitCents,
        accessibilitySelected,
      },
      include: { hold: true },
    });

    let itemId: string;
    if (existingItem) {
      await tx.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: { increment: input.quantity },
          // Prefer seat_map / best_available marker if this add has seats.
          ...(seatingMode !== "free" ? { seatingMode } : {}),
        },
      });
      if (existingItem.hold?.status === "held") {
        await tx.inventoryHold.update({
          where: { id: existingItem.hold.id },
          data: {
            quantity: { increment: input.quantity },
            expiresAt,
          },
        });
      } else {
        await tx.inventoryHold.create({
          data: {
            poolId: pool.id,
            cartItemId: existingItem.id,
            quantity: input.quantity,
            status: "held",
            expiresAt,
          },
        });
      }
      itemId = existingItem.id;
    } else {
      const item = await tx.cartItem.create({
        data: {
          cartId: cart.id,
          eventId: category.eventId,
          categoryId: category.id,
          quantity: input.quantity,
          unitPriceGrossCents: pricedUnit.unitCents,
          unitListGrossCents: pricedUnit.listCents,
          accessibilitySelected,
          priceCampaignId: pricedUnit.campaignId,
          priceCampaignName: pricedUnit.campaignName,
          seatingMode,
        },
      });
      await tx.inventoryHold.create({
        data: {
          poolId: pool.id,
          cartItemId: item.id,
          quantity: input.quantity,
          status: "held",
          expiresAt,
        },
      });
      itemId = item.id;
    }

    if (seatIdsToHold.length > 0) {
      // Atomic claim — require still-available + unlocked so concurrent carts cannot steal.
      const claimed = await tx.eventSeat.updateMany({
        where: {
          id: { in: seatIdsToHold },
          status: "available",
          locked: false,
        },
        data: {
          status: "held",
          holdExpiresAt: expiresAt,
          cartItemId: itemId,
        },
      });
      if (claimed.count !== seatIdsToHold.length) throw new Error("SEATS_UNAVAILABLE");
    }

    await tx.cart.update({
      where: { id: cart.id },
      data: { expiresAt },
    });
      });
      lastSeatError = null;
      break;
    } catch (err) {
      lastSeatError = err instanceof Error ? err : new Error(String(err));
      // Retry only Bestplatz races — manual selection / gap rule / stock should fail fast.
      const code = lastSeatError.message;
      const retryable =
        needsSeats &&
        seatingMode === "best_available" &&
        code === "SEATS_UNAVAILABLE" &&
        attempt < MAX_SEAT_CLAIM_ATTEMPTS;
      if (!retryable) throw lastSeatError;
    }
  }
  if (lastSeatError) throw lastSeatError;

  // Prefer read-only reload — never mint a second empty cart after a successful add.
  // Skip seating schema ensure on reload: transaction already touched seats if needed.
  const reloaded = await findOpenCart({
    userId: input.userId,
    sessionKey: cart.sessionKey,
  });
  if (reloaded) return reloaded;
  return getOpenCart({ userId: input.userId, sessionKey: cart.sessionKey });
}

export async function removeCartItem(
  itemId: string,
  opts?: { userId?: string | null; sessionKey?: string | null },
) {
  const cart = await getOpenCart(opts);
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    include: { hold: true },
  });
  if (!item) throw new Error("NOT_FOUND");

  const { releaseHeldQuantity } = await import("@/lib/commerce/hold-quantity");
  await prisma.$transaction(async (tx) => {
    if (item.hold?.status === "held") {
      await releaseHeldQuantity(tx, item.hold, "released");
    }
    await tx.eventSeat.updateMany({
      where: { cartItemId: item.id, status: "held" },
      data: { status: "available", holdExpiresAt: null, cartItemId: null },
    });
    await tx.cartItem.delete({ where: { id: item.id } });
  });

  return getOpenCart(opts);
}

/** Ticket subtotal only — use priceCart() for totals including fees. */
export function summarizeCart(cart: Awaited<ReturnType<typeof getOpenCart>>) {
  const ticketsGrossCents = cart.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceGrossCents,
    0,
  );
  return {
    itemCount: cart.items.reduce((s, i) => s + i.quantity, 0),
    ticketsGrossCents,
    grossCents: ticketsGrossCents,
    currency: cart.currency,
    expiresAt: cart.expiresAt,
  };
}

/**
 * Re-resolve campaign / accessibility prices on open cart lines before checkout.
 * Keeps unit prices truthful if a campaign expired while items were held.
 */
export async function repriceOpenCart(cartId: string) {
  const { loadEventPriceCampaigns, accessibilityOfferFromEvent } = await import(
    "@/lib/commerce/load-event-pricing"
  );
  const { resolveTicketUnitPrice } = await import("@/lib/commerce/event-pricing");
  const { ensureEventPricingSchema } = await import(
    "@/lib/commerce/ensure-event-pricing-schema"
  );
  await ensureEventPricingSchema(prisma);

  const items = await prisma.cartItem.findMany({
    where: { cartId },
    include: {
      category: {
        include: {
          event: true,
        },
      },
    },
  });
  if (items.length === 0) return;

  const campaignsByEvent = new Map<string, Awaited<ReturnType<typeof loadEventPriceCampaigns>>>();
  const now = new Date();

  for (const item of items) {
    let campaigns = campaignsByEvent.get(item.eventId);
    if (!campaigns) {
      campaigns = await loadEventPriceCampaigns(item.eventId);
      campaignsByEvent.set(item.eventId, campaigns);
    }
    const accessibility = accessibilityOfferFromEvent(item.category.event);
    const accessibilitySelected = Boolean(
      item.accessibilitySelected && accessibility.enabled,
    );
    const priced = resolveTicketUnitPrice({
      listCents: item.category.priceGrossCents,
      categoryId: item.categoryId,
      channel: "online",
      now,
      campaigns,
      accessibility,
      accessibilitySelected,
    });
    if (
      priced.unitCents !== item.unitPriceGrossCents ||
      priced.listCents !== item.unitListGrossCents ||
      priced.campaignId !== item.priceCampaignId
    ) {
      await prisma.cartItem.update({
        where: { id: item.id },
        data: {
          unitPriceGrossCents: priced.unitCents,
          unitListGrossCents: priced.listCents,
          priceCampaignId: priced.campaignId,
          priceCampaignName: priced.campaignName,
          accessibilitySelected,
        },
      });
    }
  }
}
