import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getOpenCart } from "@/lib/commerce/cart";
import { readCartSessionKey } from "@/lib/commerce/cart-session";
import { priceCart } from "@/lib/commerce/pricing";
import { writeAudit } from "@/lib/audit";
import { buildSellerIdentity, formatSellerAddress } from "@/lib/legal/seller";
import { getPaymentProvider } from "@/lib/payments";
import {
  estimatePaymentFeeCents,
  estimateNetPayoutCents,
  isPaymentMethodKey,
  normalizePaymentMethodKey,
  parsePaymentFeeConfig,
  providerForMethod,
  type PaymentMethodKey,
} from "@/lib/commerce/payment-fees";
import { sepaReservationExpiresAt } from "@/lib/commerce/sepa-availability";
import { ensureSepaPaymentSchema } from "@/lib/commerce/ensure-sepa-schema";
import { ensureLegalSchema } from "@/lib/legal/sync-catalog";
import { ensureSeatingAssignmentSchema } from "@/lib/seating/ensure-schema";

export type CheckoutCustomerInput = {
  email: string;
  /** guest = kein Login-Konto; register = Konto mit Passwort */
  checkoutMode: "guest" | "register";
  password?: string;
  salutation?: string;
  /** Required for formal address (Herr/Frau). */
  gender: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country?: string;
  phone?: string;
  acceptTerms: boolean;
  acknowledgePrivacy: boolean;
  acknowledgeNoWithdrawal: boolean;
};

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

export async function createOrderFromCart(input: {
  userId?: string | null;
  /** Prefer explicit session (iframe header) over cookie alone. */
  sessionKey?: string | null;
  customer: CheckoutCustomerInput;
  /** Selected payment method — never changes customer total */
  paymentMethod: PaymentMethodKey | string;
  invoice?: {
    requested: boolean;
    recipientType?: "private" | "company" | null;
    companyName?: string | null;
    contactName?: string | null;
    vatId?: string | null;
    orderReference?: string | null;
    street?: string | null;
    houseNumber?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
  };
}) {
  if (!input.customer.acceptTerms) throw new Error("TERMS_REQUIRED");
  if (!input.customer.acknowledgePrivacy) throw new Error("PRIVACY_REQUIRED");
  if (!input.customer.acknowledgeNoWithdrawal) throw new Error("WITHDRAWAL_ACK_REQUIRED");
  await ensureSepaPaymentSchema(prisma);
  await ensureLegalSchema(prisma);
  // Cart loads EventSeat (category_id) — recover if migrate deploy lagged.
  await ensureSeatingAssignmentSchema(prisma);
  const paymentMethod =
    normalizePaymentMethodKey(String(input.paymentMethod)) ??
    (isPaymentMethodKey(String(input.paymentMethod))
      ? (input.paymentMethod as PaymentMethodKey)
      : null);
  if (!paymentMethod) throw new Error("PAYMENT_METHOD_REQUIRED");

  const sessionKey = input.sessionKey?.trim() || (await readCartSessionKey());
  if (!sessionKey) throw new Error("CART_EMPTY");
  const cart = await getOpenCart({ userId: input.userId, sessionKey });
  if (cart.items.length === 0) throw new Error("CART_EMPTY");
  if (cart.expiresAt < new Date()) throw new Error("CART_EXPIRED");

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: cart.organizationId },
    include: { settings: true },
  });
  const seller = buildSellerIdentity(org, org.settings);
  const feeConfig = parsePaymentFeeConfig(org.settings?.paymentFeeConfig);
  const methodConfig = feeConfig[paymentMethod];
  const providerKey = getPaymentProvider().key;
  const allowDevTest = providerKey === "dev";
  const canUseMethod =
    (methodConfig.active && providerKey === "stripe") ||
    (methodConfig.testMode && allowDevTest);
  if (!canUseMethod) throw new Error("PAYMENT_METHOD_UNAVAILABLE");

  const priced = await priceCart(cart);
  const customerTotalCents = priced.grossCents;
  const estimatedPaymentFeeCents = estimatePaymentFeeCents(
    paymentMethod,
    customerTotalCents,
    feeConfig,
  );
  const netPayoutCents = estimateNetPayoutCents(customerTotalCents, estimatedPaymentFeeCents);
  const paymentProvider = providerForMethod(paymentMethod);
  const emailNormalized = normalizeEmail(input.customer.email);
  const mode = input.customer.checkoutMode;

  if (mode === "register") {
    const password = input.customer.password?.trim() ?? "";
    if (password.length < 8) throw new Error("PASSWORD_REQUIRED");
  }

  const existingUser = await prisma.user.findUnique({ where: { email: emailNormalized } });

  let userId = input.userId ?? null;

  if (userId) {
    // Already logged in — keep session user
  } else if (mode === "register") {
    if (existingUser) throw new Error("ACCOUNT_EXISTS");
    const password = input.customer.password!.trim();
    const created = await prisma.user.create({
      data: {
        email: emailNormalized,
        name: `${input.customer.firstName} ${input.customer.lastName}`,
        passwordHash: await bcrypt.hash(password, 12),
        emailVerified: null,
        status: "active",
      },
    });
    userId = created.id;
  } else {
    // Guest: no login account. If email already has an account, ask to sign in.
    if (existingUser?.passwordHash) throw new Error("ACCOUNT_EXISTS");
    userId = null;
  }

  const customer = await prisma.customer.upsert({
    where: {
      organizationId_emailNormalized: {
        organizationId: cart.organizationId,
        emailNormalized,
      },
    },
    update: {
      // Only link user when registering / already logged in
      ...(userId ? { userId } : {}),
      firstName: input.customer.firstName,
      lastName: input.customer.lastName,
      salutation:
        input.customer.salutation ||
        (input.customer.gender === "female"
          ? "frau"
          : input.customer.gender === "male"
            ? "herr"
            : input.customer.gender === "diverse"
              ? "divers"
              : null),
      gender: input.customer.gender,
      birthDate: input.customer.birthDate ? new Date(input.customer.birthDate) : null,
      street: input.customer.street,
      houseNumber: input.customer.houseNumber,
      postalCode: input.customer.postalCode,
      city: input.customer.city,
      country: input.customer.country ?? "DE",
      phone: input.customer.phone,
    },
    create: {
      organizationId: cart.organizationId,
      userId,
      email: emailNormalized,
      emailNormalized,
      firstName: input.customer.firstName,
      lastName: input.customer.lastName,
      salutation:
        input.customer.salutation ||
        (input.customer.gender === "female"
          ? "frau"
          : input.customer.gender === "male"
            ? "herr"
            : input.customer.gender === "diverse"
              ? "divers"
              : null),
      gender: input.customer.gender,
      birthDate: input.customer.birthDate ? new Date(input.customer.birthDate) : null,
      street: input.customer.street,
      houseNumber: input.customer.houseNumber,
      postalCode: input.customer.postalCode,
      city: input.customer.city,
      country: input.customer.country ?? "DE",
      phone: input.customer.phone,
    },
  });

  const legalVersions = await prisma.legalDocumentVersion.findMany({
    where: {
      status: "published",
      legalDocument: {
        organizationId: cart.organizationId,
        enabled: true,
        type: { in: ["terms", "event_terms", "privacy", "withdrawal", "refund"] },
      },
    },
    include: { legalDocument: true },
  });

  const order = await prisma.$transaction(async (tx) => {
    for (const item of cart.items) {
      if (!item.hold || item.hold.status !== "held" || item.hold.expiresAt < new Date()) {
        throw new Error("HOLD_EXPIRED");
      }
      const pool = await tx.inventoryPool.findUniqueOrThrow({
        where: { id: item.hold.poolId },
      });
      if (pool.soldQuantity + pool.heldQuantity > pool.capacity) {
        throw new Error("INVENTORY_INVALID");
      }
    }

    const count = await tx.order.count({ where: { organizationId: cart.organizationId } });
    const year = new Date().getFullYear();
    const orderNumber = `TF-B-${year}-${String(count + 1).padStart(6, "0")}`;

    if (priced.lineSplits.length !== cart.items.length) throw new Error("PRICE_MISMATCH");

    const itemPayloads = cart.items.map((item, index) => {
      const split = priced.lineSplits[index];
      return {
        eventId: item.eventId,
        categoryId: item.categoryId,
        quantity: item.quantity,
        productNameSnapshot: `${item.category.name} Ticket`,
        eventNameSnapshot: item.category.event.name,
        eventStartsAtSnapshot: item.category.event.eventStartsAt,
        locationSnapshot: item.category.event.location
          ? `${item.category.event.location.name}, ${item.category.event.location.city ?? ""}`
          : null,
        categorySnapshot: item.category.name,
        unitListGrossCents: item.unitPriceGrossCents,
        unitPaidGrossCents:
          item.quantity > 0 ? Math.round(split.lineGrossCents / item.quantity) : 0,
        discountCents: split.discountShareCents,
        taxRateBps: split.taxRateBps,
        netCents: split.lineNetCents,
        taxCents: split.lineTaxCents,
        grossCents: split.lineGrossCents,
      };
    });

    const ticketsGrossCents = priced.ticketsGrossCents;
    const netCents = priced.netCents;
    const taxCents = priced.taxCents;
    const grossCents = priced.customerTotalCents;
    if (grossCents !== customerTotalCents) throw new Error("PRICE_MISMATCH");

    const sellerSnapshot = {
      ...seller,
      addressLine: formatSellerAddress(seller),
      role: "seller",
    };
    const organizerSnapshot = {
      ...sellerSnapshot,
      role: "organizer",
      eventBrand: seller.brandName,
    };
    const contractSnapshot = {
      locale: "de-DE",
      acceptedAt: new Date().toISOString(),
      checkoutMode: mode,
      acceptTerms: true,
      acknowledgePrivacy: true,
      acknowledgeNoWithdrawal: true,
      withdrawalNotice:
        "Für Eintrittskarten zu dieser termingebundenen Veranstaltung besteht kein gesetzliches Widerrufsrecht.",
      legalVersions: legalVersions.map((v) => ({
        id: v.id,
        type: v.legalDocument.type,
        version: v.version,
        title: v.title,
        contentSnapshot: v.content,
      })),
    };

    const createdOrder = await tx.order.create({
      data: {
        organizationId: cart.organizationId,
        customerId: customer.id,
        cartId: cart.id,
        orderNumber,
        status: "pending_payment",
        channel: "online",
        currency: cart.currency,
        netCents,
        taxCents,
        grossCents,
        ticketsGrossCents,
        ticketSubtotalCents: ticketsGrossCents,
        feeGrossCents: priced.feeGrossCents,
        feeNetCents: priced.feeNetCents,
        feeTaxCents: priced.feeTaxCents,
        feeSnapshot: priced.feeSnapshot as object,
        administrationFeePercentageBasisPoints: priced.administrationFeePercentageBasisPoints,
        administrationFeeGrossCents: priced.feeGrossCents,
        administrationFeeNetCents: priced.feeNetCents,
        administrationFeeTaxCents: priced.feeTaxCents,
        administrationFeeTaxAllocations: priced.administrationFeeTaxAllocations,
        calculationVersion: priced.calculationVersion,
        discountCode: priced.discountCode,
        discountCents: priced.discountCents,
        giftCardCode: priced.giftCardCode,
        giftCardAppliedCents: priced.giftCardAppliedCents,
        customerTotalCents,
        paymentMethod,
        paymentProvider,
        estimatedPaymentFeeCents,
        stripeFeeEstimatedCents: estimatedPaymentFeeCents,
        netPayoutCents,
        stripeNetPayoutCents: netPayoutCents,
        paymentStatus: "pending",
        providerFeeCurrency: "EUR",
        paymentCreatedAt: new Date(),
        invoiceRequested: Boolean(input.invoice?.requested),
        invoiceRecipientType: input.invoice?.recipientType ?? null,
        invoiceCompanyName: input.invoice?.companyName ?? null,
        invoiceContactName: input.invoice?.contactName ?? null,
        invoiceVatId: input.invoice?.vatId ?? null,
        invoiceOrderReference: input.invoice?.orderReference ?? null,
        invoiceStreet: input.invoice?.street ?? null,
        invoiceHouseNumber: input.invoice?.houseNumber ?? null,
        invoicePostalCode: input.invoice?.postalCode ?? null,
        invoiceCity: input.invoice?.city ?? null,
        invoiceCountry: input.invoice?.country ?? null,
        billingSnapshot: {
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          street: customer.street,
          houseNumber: customer.houseNumber,
          postalCode: customer.postalCode,
          city: customer.city,
          country: customer.country,
        },
        sellerSnapshot,
        organizerSnapshot,
        contractSnapshot,
        items: { create: itemPayloads },
        legalAcceptances: {
          create: legalVersions.map((v) => ({
            legalDocumentVersionId: v.id,
          })),
        },
      },
      include: { items: true },
    });

    await tx.cart.update({
      where: { id: cart.id },
      data: { status: "converted", userId },
    });

    // Extend inventory holds for the payment window (esp. SEPA async clearing).
    const soonestStart = cart.items.reduce<Date | null>((min, item) => {
      const at = item.category.event.eventStartsAt;
      if (!at) return min;
      return !min || at < min ? at : min;
    }, null);
    const reservedUntil =
      paymentMethod === "sepa_debit"
        ? sepaReservationExpiresAt(soonestStart)
        : new Date(Date.now() + 60 * 60 * 1000); // 1h for card/wallet confirm

    for (const item of cart.items) {
      if (!item.hold) continue;
      await tx.inventoryHold.update({
        where: { id: item.hold.id },
        data: {
          orderId: createdOrder.id,
          expiresAt: reservedUntil,
          status: "held",
        },
      });
      if (item.seats?.length) {
        await tx.eventSeat.updateMany({
          where: { cartItemId: item.id, status: "held" },
          data: { holdExpiresAt: reservedUntil },
        });
      }
    }

    await tx.order.update({
      where: { id: createdOrder.id },
      data: {
        reservationStatus: "held",
        reservedUntil,
      },
    });

    return createdOrder;
  });

  const provider = getPaymentProvider();
  const createdPayment = await provider.createPayment({
    organizationId: cart.organizationId,
    orderId: order.id,
    amountCents: order.customerTotalCents || order.grossCents,
    currency: order.currency,
    customerEmail: emailNormalized,
  });

  const payment = await prisma.payment.create({
    data: {
      organizationId: cart.organizationId,
      orderId: order.id,
      provider: createdPayment.provider === "dev" ? "dev" : paymentProvider,
      providerPaymentId: createdPayment.providerPaymentId,
      status: createdPayment.status === "paid" ? "paid" : "pending",
      amountCents: customerTotalCents,
      currency: order.currency,
      method: paymentMethod,
      rawStatus: createdPayment.status,
    },
  });

  await writeAudit({
    organizationId: cart.organizationId,
    actorUserId: userId,
    action: "order.created",
    entityType: "order",
    entityId: order.id,
    after: {
      orderNumber: order.orderNumber,
      customerTotalCents,
      estimatedPaymentFeeCents,
      paymentMethod,
      paymentProvider,
      seller: seller.displayName,
    },
  });

  return { order, payment, clientSecret: createdPayment.clientSecret };
}
