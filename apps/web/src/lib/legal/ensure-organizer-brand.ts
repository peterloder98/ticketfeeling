import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const SCHLAGERFEELING_SLUG = "schlagerfeeling";
const DEFAULT_LEGAL_PERSON = "Peter Loder";
const DEFAULT_BRAND = "SCHLAGERfeeling";

/**
 * Soft-ensure Veranstalter identity for the schlagerfeeling org.
 * Ticketfeeling is the platform brand — never the Veranstalter display name.
 * Idempotent; safe on public event page loads.
 */
export async function ensureSchlagerfeelingOrganizerBrand(): Promise<boolean> {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: SCHLAGERFEELING_SLUG },
      select: {
        id: true,
        settings: { select: { id: true, legalName: true, data: true } },
      },
    });
    if (!org?.settings) return false;

    const data = (
      org.settings.data && typeof org.settings.data === "object" && !Array.isArray(org.settings.data)
        ? { ...(org.settings.data as Record<string, unknown>) }
        : {}
    ) as Record<string, unknown>;

    let dirty = false;
    if (data.legalPersonName !== DEFAULT_LEGAL_PERSON) {
      data.legalPersonName = DEFAULT_LEGAL_PERSON;
      dirty = true;
    }
    if (data.brandName !== DEFAULT_BRAND) {
      data.brandName = DEFAULT_BRAND;
      dirty = true;
    }
    // tradeName was historically seeded as "Ticketfeeling" (platform). Prefer brand for Veranstalter.
    if (
      typeof data.tradeName !== "string" ||
      !data.tradeName.trim() ||
      data.tradeName.trim().toLowerCase() === "ticketfeeling"
    ) {
      data.tradeName = DEFAULT_BRAND;
      dirty = true;
    }

    const legalNameDirty =
      !org.settings.legalName?.trim() || org.settings.legalName.trim() !== DEFAULT_LEGAL_PERSON;

    if (!dirty && !legalNameDirty) return false;

    await prisma.organizationSettings.update({
      where: { id: org.settings.id },
      data: {
        ...(legalNameDirty ? { legalName: DEFAULT_LEGAL_PERSON } : {}),
        ...(dirty ? { data: data as Prisma.InputJsonValue } : {}),
      },
    });
    return true;
  } catch (err) {
    console.error("[ensureSchlagerfeelingOrganizerBrand]", err);
    return false;
  }
}
