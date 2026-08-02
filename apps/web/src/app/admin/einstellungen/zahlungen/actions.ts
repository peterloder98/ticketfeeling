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
  type PaymentFeeConfigMap,
  type PaymentMethodKey,
} from "@/lib/commerce/payment-fees";

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

  const config: PaymentFeeConfigMap = {
    card: readMethod(formData, "card"),
    sepa_debit: readMethod(formData, "sepa_debit"),
    apple_pay: readMethod(formData, "apple_pay"),
    google_pay: readMethod(formData, "google_pay"),
  };

  for (const key of Object.keys(config) as PaymentMethodKey[]) {
    config[key].customerSurchargeEnabled = false;
  }

  // Product rule: tickets ONLY after payment is confirmed (never on SEPA submit).
  const sepaTicketReleaseMode = "after_confirmed";
  const sepaMinDays = Math.max(
    0,
    Math.round(Number(String(formData.get("sepaMinDaysBeforeEvent") ?? "14")) || 14),
  );

  await prisma.organizationSettings.update({
    where: { organizationId: membership.organizationId },
    data: {
      paymentFeeConfig: config,
      stripeFeeConfig: config,
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
    after: { config, sepaTicketReleaseMode, sepaMinDaysBeforeEvent: sepaMinDays },
  });

  revalidatePath("/admin/einstellungen/zahlungen");
  revalidatePath("/checkout");
}

export async function resetPaymentFeeConfigAction() {
  const { session, membership } = await requireOrgWrite();
  await prisma.organizationSettings.update({
    where: { organizationId: membership.organizationId },
    data: {
      paymentFeeConfig: DEFAULT_PAYMENT_FEE_CONFIG,
      stripeFeeConfig: DEFAULT_PAYMENT_FEE_CONFIG,
    },
  });
  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.payment_fee_config.reset",
    entityType: "organization_settings",
    entityId: membership.organizationId,
  });
  revalidatePath("/admin/einstellungen/zahlungen");
}
