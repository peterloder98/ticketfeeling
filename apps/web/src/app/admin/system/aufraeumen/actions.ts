"use server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, getUserPermissionKeys } from "@/lib/rbac";
import {
  PURGE_CONFIRM_PHRASE,
  PURGE_ORG_SLUG,
  purgeTestCommerce,
  type PurgeTestCommerceResult,
} from "@/lib/admin/purge-test-commerce";
import { canAccessSystemStorage } from "@/lib/admin/system-access";

export type PurgeTestCommerceState = {
  ok: boolean | null;
  message: string;
  result?: Pick<
    PurgeTestCommerceResult,
    | "ordersDeleted"
    | "eventsDeleted"
    | "eventsKept"
    | "emptyToursDeleted"
    | "loewenbergScheduleCleared"
  >;
};

async function requirePurgeAdmin(): Promise<
  | { error: string }
  | {
      userId: string;
      organizationId: string;
    }
> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Bitte zuerst anmelden." };
  }
  const membership = await getDefaultOrganizationForUser(userId);
  if (!membership) {
    return { error: "Keine Organisation." };
  }

  const keys = await getUserPermissionKeys(userId, membership.organizationId);
  if (!canAccessSystemStorage(keys)) {
    return { error: "Keine Berechtigung." };
  }

  if (membership.organization.slug !== PURGE_ORG_SLUG) {
    return {
      error: `Aufräumen ist nur für die Organisation „${PURGE_ORG_SLUG}“ freigeschaltet.`,
    };
  }

  return { userId, organizationId: membership.organizationId };
}

export async function purgeTestCommerceAction(
  _prev: PurgeTestCommerceState,
  formData: FormData,
): Promise<PurgeTestCommerceState> {
  const gate = await requirePurgeAdmin();
  if ("error" in gate) {
    return { ok: false, message: gate.error };
  }
  const { userId, organizationId } = gate;

  const phrase = String(formData.get("confirmPhrase") ?? "").trim();
  if (phrase !== PURGE_CONFIRM_PHRASE) {
    return {
      ok: false,
      message: `Bitte zur Bestätigung exakt „${PURGE_CONFIRM_PHRASE}“ eingeben.`,
    };
  }

  try {
    const result = await purgeTestCommerce(prisma, { dryRun: false });

    await writeAudit({
      organizationId,
      actorUserId: userId,
      action: "system.purge_test_commerce",
      entityType: "organization",
      entityId: organizationId,
      after: {
        ordersDeleted: result.ordersDeleted,
        eventsDeleted: result.eventsDeleted,
        eventsKept: result.eventsKept,
        emptyToursDeleted: result.emptyToursDeleted,
        loewenbergScheduleCleared: result.loewenbergScheduleCleared,
      },
      reason: "Admin System Aufräumen",
    });

    return {
      ok: true,
      message: `Fertig: ${result.ordersDeleted} Bestellung(en) und ${result.eventsDeleted} Event(s) entfernt. Behalten: ${result.eventsKept.length || 0}.`,
      result: {
        ordersDeleted: result.ordersDeleted,
        eventsDeleted: result.eventsDeleted,
        eventsKept: result.eventsKept,
        emptyToursDeleted: result.emptyToursDeleted,
        loewenbergScheduleCleared: result.loewenbergScheduleCleared,
      },
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unbekannter Fehler";
    return { ok: false, message: `Aufräumen fehlgeschlagen: ${detail}` };
  }
}
