"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { importPayoutBalanceTransactions } from "@/lib/stripe-payout/import-payout";
import { applyManualOrderMapping } from "@/lib/stripe-payout/map-order";
import {
  createPayoutDocumentPreview,
  finalizePayoutDocuments,
} from "@/lib/stripe-payout/documents";
import { runPayoutReconcileJob } from "@/lib/stripe-payout/sync";
import { writePayoutAudit } from "@/lib/stripe-payout/audit";
import type { PayoutDocumentType } from "@/lib/stripe-payout/types";

async function requireFinanceAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("UNAUTHORIZED");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) throw new Error("UNAUTHORIZED");
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "org:write",
  );
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

export async function syncPayoutAction(formData: FormData) {
  const { session } = await requireFinanceAdmin();
  const id = String(formData.get("payoutId") ?? "");
  await importPayoutBalanceTransactions(id);
  await writePayoutAudit({
    localPayoutId: id,
    action: "manual_sync",
    actorType: "user",
    actorId: session.user.id,
  });
  revalidatePath("/admin/finanzen/stripe");
  revalidatePath(`/admin/finanzen/stripe/${id}`);
}

export async function runDailyReconcileAction() {
  await requireFinanceAdmin();
  await runPayoutReconcileJob({ kind: "manual", lookbackDays: 45 });
  revalidatePath("/admin/finanzen/stripe");
  revalidatePath("/admin/finanzen/stripe/system");
}

export async function previewDocumentsAction(formData: FormData) {
  const { session } = await requireFinanceAdmin();
  const id = String(formData.get("payoutId") ?? "");
  for (const documentType of [
    "revenue_collective",
    "stripe_costs",
    "payout_reconciliation",
  ] as PayoutDocumentType[]) {
    await createPayoutDocumentPreview(id, documentType, session.user.id);
  }
  revalidatePath(`/admin/finanzen/stripe/${id}`);
}

export async function finalizeDocumentsAction(formData: FormData) {
  const { session } = await requireFinanceAdmin();
  const id = String(formData.get("payoutId") ?? "");
  await finalizePayoutDocuments(id, session.user.id);
  revalidatePath(`/admin/finanzen/stripe/${id}`);
  revalidatePath("/admin/finanzen/stripe");
}

export async function markLexofficeAction(formData: FormData) {
  const { session, membership } = await requireFinanceAdmin();
  const id = String(formData.get("payoutId") ?? "");
  const reference = String(formData.get("lexofficeReference") ?? "").trim() || null;
  const prisma = getPrisma();
  await prisma.stripePayout.update({
    where: { id },
    data: {
      lexofficeStatus: "marked",
      lexofficeMarkedAt: new Date(),
      lexofficeReference: reference,
      organizationId: membership.organizationId,
    },
  });
  await writePayoutAudit({
    localPayoutId: id,
    organizationId: membership.organizationId,
    action: "lexoffice_marked",
    newValue: { reference },
    actorType: "user",
    actorId: session.user.id,
  });
  revalidatePath(`/admin/finanzen/stripe/${id}`);
}

export async function mapOrderAction(formData: FormData) {
  const { session } = await requireFinanceAdmin();
  const balanceTransactionId = String(formData.get("balanceTransactionId") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  await applyManualOrderMapping({
    balanceTransactionId,
    orderId,
    actorUserId: session.user.id,
    reason,
  });
  const prisma = getPrisma();
  const bt = await prisma.stripeBalanceTransaction.findUnique({
    where: { id: balanceTransactionId },
  });
  if (bt?.localPayoutId) {
    await importPayoutBalanceTransactions(bt.localPayoutId);
    revalidatePath(`/admin/finanzen/stripe/${bt.localPayoutId}`);
  }
  revalidatePath("/admin/finanzen/stripe");
}

export async function saveAdminNoteAction(formData: FormData) {
  const { session, membership } = await requireFinanceAdmin();
  const id = String(formData.get("payoutId") ?? "");
  const note = String(formData.get("adminNote") ?? "");
  const prisma = getPrisma();
  await prisma.stripePayout.update({
    where: { id },
    data: { adminNote: note },
  });
  await writePayoutAudit({
    localPayoutId: id,
    organizationId: membership.organizationId,
    action: "admin_note",
    newValue: { note: note.slice(0, 500) },
    actorType: "user",
    actorId: session.user.id,
  });
  revalidatePath(`/admin/finanzen/stripe/${id}`);
}

export async function uploadStripeOriginalAction(formData: FormData) {
  const { session, membership } = await requireFinanceAdmin();
  const payoutId = String(formData.get("payoutId") ?? "") || null;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("FILE_REQUIRED");
  const buf = Buffer.from(await file.arrayBuffer());
  const { createHash } = await import("crypto");
  const checksum = createHash("sha256").update(buf).digest("hex");
  const prisma = getPrisma();
  await prisma.stripeOriginalUpload.create({
    data: {
      organizationId: membership.organizationId,
      localPayoutId: payoutId,
      kind: String(formData.get("kind") ?? "other"),
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      checksumSha256: checksum,
      byteSize: buf.length,
      data: buf,
      periodLabel: String(formData.get("periodLabel") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
      uploadedByUserId: session.user.id,
    },
  });
  revalidatePath("/admin/finanzen/stripe");
  if (payoutId) revalidatePath(`/admin/finanzen/stripe/${payoutId}`);
}
