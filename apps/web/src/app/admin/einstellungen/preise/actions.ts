"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  DEFAULT_PLATFORM_FEE_CONFIG,
  parsePlatformFeeConfig,
  type PlatformFeeConfig,
} from "@/lib/commerce/platform-fee";

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

export async function updatePlatformFeeConfigAction(formData: FormData) {
  const { session, membership } = await requireOrgWrite();
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: membership.organizationId },
  });
  const before = parsePlatformFeeConfig(settings?.platformFeeConfig);

  const percent = Number(String(formData.get("percentage") ?? "3").replace(",", "."));
  const percentageBasisPoints = Math.max(
    0,
    Math.round((Number.isFinite(percent) ? percent : 3) * 100),
  );
  const customTaxPercent = Number(
    String(formData.get("customTaxPercent") ?? "7").replace(",", "."),
  );
  const customTaxRateBasisPoints = Math.max(
    0,
    Math.round((Number.isFinite(customTaxPercent) ? customTaxPercent : 7) * 100),
  );

  const after: PlatformFeeConfig = {
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    percentageBasisPoints,
    displayName:
      String(formData.get("displayName") ?? "").trim() || DEFAULT_PLATFORM_FEE_CONFIG.displayName,
    calculationBase:
      formData.get("calculationBase") === "ticket_subtotal_before_discounts"
        ? "ticket_subtotal_before_discounts"
        : "ticket_subtotal_after_discounts",
    taxMode: formData.get("taxMode") === "custom" ? "custom" : "inherit_ticket_tax_rate",
    customTaxRateBasisPoints:
      formData.get("taxMode") === "custom" ? customTaxRateBasisPoints : null,
    customerDescription:
      String(formData.get("customerDescription") ?? "").trim() ||
      DEFAULT_PLATFORM_FEE_CONFIG.customerDescription,
    activeFrom: String(formData.get("activeFrom") ?? "").trim() || null,
    version: before.version + 1,
  };

  await prisma.organizationSettings.update({
    where: { organizationId: membership.organizationId },
    data: { platformFeeConfig: after },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.platform_fee.updated",
    entityType: "organization_settings",
    entityId: membership.organizationId,
    before,
    after: {
      ...after,
      reason: String(formData.get("changeReason") ?? "").trim() || null,
    },
  });

  revalidatePath("/admin/einstellungen/preise");
  revalidatePath("/admin/einstellungen");
  revalidatePath("/events");
  revalidatePath("/checkout");
  revalidatePath("/warenkorb");
}
