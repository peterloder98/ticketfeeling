import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { ensureSepaPaymentSchema } from "@/lib/commerce/ensure-sepa-schema";
import { ensureCompanyAddressSchema } from "@/lib/legal/ensure-company-address-schema";

async function fetchDefaultOrganization() {
  try {
    return await prisma.organization.findFirst({
      where: { status: "active" },
      orderBy: { createdAt: "asc" },
      include: { settings: true },
    });
  } catch (error) {
    // Common on Vercel when Prisma Client expects columns (e.g. payment_ui_config)
    // that migrate deploy has not applied yet. Patch + retry, then degrade.
    console.error("[org] findFirst with settings failed", error);
    await Promise.all([
      ensureSepaPaymentSchema(prisma),
      ensureCompanyAddressSchema(prisma).catch(() => undefined),
    ]);
    try {
      return await prisma.organization.findFirst({
        where: { status: "active" },
        orderBy: { createdAt: "asc" },
        include: { settings: true },
      });
    } catch (retryError) {
      console.error("[org] settings retry failed, loading bare org", retryError);
      try {
        const org = await prisma.organization.findFirst({
          where: { status: "active" },
          orderBy: { createdAt: "asc" },
        });
        if (!org) return null;
        return { ...org, settings: null };
      } catch (fallbackError) {
        console.error("[org] bare org load failed", fallbackError);
        return null;
      }
    }
  }
}

const loadDefaultOrganization = unstable_cache(
  async () => {
    try {
      return await fetchDefaultOrganization();
    } catch (error) {
      console.error("[org] loadDefaultOrganization failed", error);
      return null;
    }
  },
  ["default-organization"],
  { revalidate: 60, tags: ["default-organization"] },
);

/** Request-deduped + 60s cross-request cache. */
export const getDefaultOrganization = cache(() => loadDefaultOrganization());
