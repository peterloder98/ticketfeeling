"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  PURGE_CONFIRM_PHRASE,
  PURGE_ORG_SLUG,
  purgeTestCommerce,
  type PurgeTestCommerceResult,
} from "@/lib/admin/purge-test-commerce";

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
      membership: NonNullable<Awaited<ReturnType<typeof getDefaultOrganizationForUser>>>;
    }
> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Bitte zuerst anmelden." };
  }
  const membership = await getDefaultOrganizationForUser(userId);
  if (!membership) {
    return { error: "Keine Organisation." };
  }

  const allowed =
    (await userHasPermission(userId, membership.organizationId, "org:write")) ||
    (await userHasPermission(userId, membership.organizationId, "users:write"));
  if (!allowed) {
    return { error: "Keine Berechtigung (nur Administrator)." };
  }

  if (membership.organization.slug !== PURGE_ORG_SLUG) {
    return {
      error: `Aufräumen ist nur für die Organisation „${PURGE_ORG_SLUG}“ freigeschaltet.`,
    };
  }

  return { userId, membership };
}

export async function purgeTestCommerceAction(
  _prev: PurgeTestCommerceState,
  formData: FormData,
): Promise<PurgeTestCommerceState> {
  const gate = await requirePurgeAdmin();
  if ("error" in gate) {
    return { ok: false, message: gate.error };
  }
  const { userId, membership } = gate;

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
      organizationId: membership.organizationId,
      actorUserId: userId,
      action: "system.purge_test_commerce",
      entityType: "organization",
      entityId: membership.organizationId,
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
