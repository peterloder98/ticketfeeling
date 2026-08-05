import { createHash } from "crypto";
import { getPrisma } from "@/lib/db";
import type { PayoutReconciliationStatus } from "@/lib/stripe-payout/types";

export async function writePayoutAudit(input: {
  localPayoutId: string;
  organizationId?: string | null;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  actorType?: string;
  actorId?: string | null;
  reason?: string | null;
}) {
  const prisma = getPrisma();
  await prisma.payoutAuditLog.create({
    data: {
      localPayoutId: input.localPayoutId,
      organizationId: input.organizationId ?? null,
      action: input.action,
      oldValue: (input.oldValue as object) ?? undefined,
      newValue: (input.newValue as object) ?? undefined,
      actorType: input.actorType ?? "system",
      actorId: input.actorId ?? null,
      reason: input.reason ?? null,
    },
  });
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function setPayoutStatus(
  localPayoutId: string,
  status: PayoutReconciliationStatus,
  extra?: Record<string, unknown>,
) {
  const prisma = getPrisma();
  const before = await prisma.stripePayout.findUnique({ where: { id: localPayoutId } });
  const updated = await prisma.stripePayout.update({
    where: { id: localPayoutId },
    data: {
      transactionReconciliationStatus: status,
      ...(status === "reconciled"
        ? { transactionReconciliationCompletedAt: new Date() }
        : {}),
      ...(extra as object),
    },
  });
  await writePayoutAudit({
    localPayoutId,
    organizationId: updated.organizationId,
    action: "reconciliation_status_changed",
    oldValue: { status: before?.transactionReconciliationStatus },
    newValue: { status, ...extra },
  });
  return updated;
}
