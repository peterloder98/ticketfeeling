"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  DEFAULT_PAYMENT_FEE_CONFIG,
  DEFAULT_PAYMENT_METHOD_ORDER,
  DEFAULT_PAYMENT_UI_CONFIG,
  normalizePaymentMethodKey,
  type PaymentFeeConfigMap,
  type PaymentMethodKey,
  type PaymentUiConfig,
} from "@/lib/commerce/payment-fees";
import { normalizeSepaTicketReleaseMode } from "@/lib/commerce/sepa-availability";

async function requireOrgWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "org:write",
  );
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

function readMethod(formData: FormData, key: PaymentMethodKey) {
  const percentage = Number(String(formData.get(`${key}_percentage`) ?? "0").replace(",", "."));
  const fixedEuros = Number(String(formData.get(`${key}_fixed`) ?? "0").replace(",", "."));
  const percentageBps = Math.max(0, Math.round((Number.isFinite(percentage) ? percentage : 0) * 100));
  const fixedFeeCents = Math.max(
    0,
    Math.round((Number.isFinite(fixedEuros) ? fixedEuros : 0) * 100),
  );
  return {
    percentageBps,
    fixedFeeCents,
    active: formData.get(`${key}_active`) === "on",
    testMode: formData.get(`${key}_testMode`) === "on",
    customerSurchargeEnabled: false,
  };
}

export async function updatePaymentFeeConfigAction(formData: FormData) {
  const { session, membership } = await requireOrgWrite();

  const before = await prisma.organizationSettings.findUnique({
    where: { organizationId: membership.organizationId },
  });

  const config: PaymentFeeConfigMap = {
    card: readMethod(formData, "card"),
    sepa_debit: readMethod(formData, "sepa_debit"),
    apple_pay: readMethod(formData, "apple_pay"),
    google_pay: readMethod(formData, "google_pay"),
    klarna: readMethod(formData, "klarna"),
  };

  for (const key of Object.keys(config) as PaymentMethodKey[]) {
    config[key].customerSurchargeEnabled = false;
  }

  const sepaTicketReleaseMode = normalizeSepaTicketReleaseMode(
    String(formData.get("sepaTicketReleaseMode") ?? "after_confirmed"),
  );
  const sepaMinDays = Math.max(
    0,
    Math.round(Number(String(formData.get("sepaMinDaysBeforeEvent") ?? "7")) || 7),
  );

  const orderRaw = String(formData.get("methodOrder") ?? "")
    .split(",")
    .map((k) => normalizePaymentMethodKey(k.trim()))
    .filter((k): k is PaymentMethodKey => Boolean(k));
  const missing = DEFAULT_PAYMENT_METHOD_ORDER.filter((k) => !orderRaw.includes(k));
  const methodOrder = orderRaw.length ? [...orderRaw, ...missing] : [...DEFAULT_PAYMENT_METHOD_ORDER];

  const ui: PaymentUiConfig = {
    methodOrder,
    sepaRecommended: formData.get("sepaRecommended") === "on",
    recommendedBadgeText:
      String(formData.get("recommendedBadgeText") ?? "").trim() ||
      DEFAULT_PAYMENT_UI_CONFIG.recommendedBadgeText,
    sepaMinDaysBeforeEvent: sepaMinDays,
  };

  await prisma.organizationSettings.update({
    where: { organizationId: membership.organizationId },
    data: {
      paymentFeeConfig: config,
      stripeFeeConfig: config,
      paymentUiConfig: ui,
      sepaTicketReleaseMode,
      sepaMinDaysBeforeEvent: sepaMinDays,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.payment_fee_config.updated",
    entityType: "organization_settings",
    entityId: membership.organizationId,
    before: {
      paymentFeeConfig: before?.paymentFeeConfig,
      paymentUiConfig: before?.paymentUiConfig,
      sepaTicketReleaseMode: before?.sepaTicketReleaseMode,
      sepaMinDaysBeforeEvent: before?.sepaMinDaysBeforeEvent,
    },
    after: {
      config,
      ui,
      sepaTicketReleaseMode,
      sepaMinDaysBeforeEvent: sepaMinDays,
    },
  });

  revalidatePath("/admin/einstellungen/zahlungen");
  revalidatePath("/checkout");
  revalidatePath("/embed/checkout");
}

export async function releaseSepaReservationAction(formData: FormData) {
  const { session, membership } = await requireOrgWrite();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) throw new Error("VALIDATION");
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      organizationId: membership.organizationId,
      paymentMethod: { in: ["sepa_debit", "stripe_sepa"] },
      paymentStatus: { in: ["pending", "processing", "failed", "canceled"] },
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const { releaseOrderHolds } = await import("@/lib/commerce/release-order-holds");
  const result = await releaseOrderHolds(order.id);
  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "order.sepa_reservation_manual_release",
    entityType: "order",
    entityId: order.id,
    before: {
      reservationStatus: order.reservationStatus,
      paymentStatus: order.paymentStatus,
      reservedUntil: order.reservedUntil,
    },
    after: {
      released: result.released,
      warning: "Manuelle Freigabe — Plätze wieder verfügbar",
    },
  });
  revalidatePath("/admin/einstellungen/zahlungen");
}

export async function resetPaymentFeeConfigAction() {
  const { session, membership } = await requireOrgWrite();
  const before = await prisma.organizationSettings.findUnique({
    where: { organizationId: membership.organizationId },
  });
  await prisma.organizationSettings.update({
    where: { organizationId: membership.organizationId },
    data: {
      paymentFeeConfig: DEFAULT_PAYMENT_FEE_CONFIG,
      stripeFeeConfig: DEFAULT_PAYMENT_FEE_CONFIG,
      paymentUiConfig: DEFAULT_PAYMENT_UI_CONFIG,
      sepaTicketReleaseMode: "after_confirmed",
      sepaMinDaysBeforeEvent: 7,
    },
  });
  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.payment_fee_config.reset",
    entityType: "organization_settings",
    entityId: membership.organizationId,
    before: {
      paymentFeeConfig: before?.paymentFeeConfig,
      paymentUiConfig: before?.paymentUiConfig,
    },
    after: {
      paymentFeeConfig: DEFAULT_PAYMENT_FEE_CONFIG,
      paymentUiConfig: DEFAULT_PAYMENT_UI_CONFIG,
    },
  });
  revalidatePath("/admin/einstellungen/zahlungen");
}
