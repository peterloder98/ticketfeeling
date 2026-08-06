import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { createSecureToken } from "@/lib/crypto-token";
import { readCartSessionKey, resolveCartSessionKey } from "@/lib/commerce/cart-session";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";
import { Prisma } from "@prisma/client";

const HOLD_MINUTES = 10;

/** Avoid running expire on every cart badge poll (focus/nav). */
let lastExpireMs = 0;
const EXPIRE_THROTTLE_MS = 15_000;

async function expireHolds(now = new Date()) {
  const { expireSeatHolds } = await import("@/lib/seating/materialize");
  await expireSeatHolds(now);

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
  if (expired.length === 0) return;

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

      const current = await tx.inventoryHold.findUnique({
        where: { id: hold.id },
        select: { id: true, status: true, cartItemId: true },
      });
      if (!current || current.status !== "held") continue;
      await tx.inventoryHold.update({
        where: { id: hold.id },
        data: { status: "expired" },
      });
      await tx.inventoryPool.update({
        where: { id: hold.poolId },
        data: { heldQuantity: { decrement: hold.quantity } },
      });
      await tx.eventSeat.updateMany({
        where: { cartItemId: current.cartItemId, status: "held" },
        data: { status: "available", holdExpiresAt: null, cartItemId: null },
      });
    }
  });
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
  // One transaction — N separate txs used to cost one RTT each.
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      if (item.hold?.status === "held") {
        await tx.inventoryHold.update({
          where: { id: item.hold.id },
          data: { status: "released" },
        });
        await tx.inventoryPool.update({
          where: { id: item.hold.poolId },
          data: { heldQuantity: { decrement: item.hold.quantity } },
        });
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

  const now = new Date();
  const { isEventSaleOpen, isCategorySaleWindowOpen } = await import("@/lib/commerce/event-sale");
  if (!isEventSaleOpen(category.event, now) || !isCategorySaleWindowOpen(category, now)) {
    throw new Error("SALE_CLOSED");
  }

  if (input.quantity < category.minPerOrder || input.quantity > category.maxPerOrder) {
    throw new Error("QUANTITY_LIMIT");
  }

  const { categoryNeedsSeats, seatsPerTicket } = await import("@/lib/seating/types");
  const { ensureEventSeatsIfNeeded } = await import("@/lib/seating/materialize");
  const {
    pickBestAvailableSeats,
    pickBestAvailablePairs,
    assignCompanionSeats,
  } = await import("@/lib/seating/best-available");

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
  } as const;

  await prisma.$transaction(async (tx) => {
    const { channelAvailableQuantity, lockCategoryInventoryPools } = await import(
      "@/lib/commerce/inventory-availability"
    );
    const lockedPools = await lockCategoryInventoryPools(tx, category.id);
    const available = channelAvailableQuantity(lockedPools, "online", category.capacity);
    if (available < input.quantity) throw new Error("SOLD_OUT");

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

      if (seatingMode === "seat_map") {
        const requested = await tx.eventSeat.findMany({
          where: {
            id: { in: input.seatIds! },
            ...sellableWhere,
          },
          select: seatSelect,
        });
        if (requested.length !== input.quantity) throw new Error("SEATS_UNAVAILABLE");
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
          const picked = pickBestAvailablePairs(all, input.quantity);
          if (picked.length !== seatSlots) throw new Error("SEATS_UNAVAILABLE");
          seatIdsToHold = picked.map((s) => s.id);
        } else {
          const picked = pickBestAvailableSeats(all, input.quantity);
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

    // Merge into an existing line when category + unit price match (same price only).
    const existingItem = await tx.cartItem.findFirst({
      where: {
        cartId: cart.id,
        categoryId: category.id,
        unitPriceGrossCents: category.priceGrossCents,
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
          unitPriceGrossCents: category.priceGrossCents,
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

  await prisma.$transaction(async (tx) => {
    if (item.hold?.status === "held") {
      await tx.inventoryHold.update({
        where: { id: item.hold.id },
        data: { status: "released" },
      });
      await tx.inventoryPool.update({
        where: { id: item.hold.poolId },
        data: { heldQuantity: { decrement: item.hold.quantity } },
      });
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
