"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { syncLegalCatalog } from "@/lib/legal/sync-catalog";
import { LEGAL_DOCUMENT_TYPES, type LegalDocumentType } from "@/lib/legal/document-types";

async function requireLegalWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) throw new Error("NO_ORG");
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "legal:write",
  );
  if (!allowed) {
    const orgWrite = await userHasPermission(
      session.user.id,
      membership.organizationId,
      "org:write",
    );
    if (!orgWrite) throw new Error("FORBIDDEN");
  }
  return { userId: session.user.id, organizationId: membership.organizationId };
}

export async function syncLegalCatalogAction() {
  const { organizationId } = await requireLegalWrite();
  await syncLegalCatalog(organizationId);
  revalidatePath("/admin/einstellungen/recht");
  revalidatePath("/recht", "layout");
}

export async function setLegalDocumentEnabledAction(formData: FormData) {
  const { organizationId } = await requireLegalWrite();
  const type = String(formData.get("type") ?? "") as LegalDocumentType;
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!LEGAL_DOCUMENT_TYPES.includes(type)) throw new Error("INVALID_TYPE");

  await prisma.legalDocument.update({
    where: { organizationId_type: { organizationId, type } },
    data: { enabled },
  });
  revalidatePath("/admin/einstellungen/recht");
  revalidatePath("/recht", "layout");
}

export async function saveLegalDraftAction(formData: FormData) {
  const { userId, organizationId } = await requireLegalWrite();
  const type = String(formData.get("type") ?? "") as LegalDocumentType;
  const version = String(formData.get("version") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  const changelog = String(formData.get("changelog") ?? "").trim() || null;
  if (!LEGAL_DOCUMENT_TYPES.includes(type)) throw new Error("INVALID_TYPE");
  if (!version || !title) throw new Error("VALIDATION");

  const doc = await prisma.legalDocument.upsert({
    where: { organizationId_type: { organizationId, type } },
    update: {},
    create: { organizationId, type, enabled: true },
  });

  await prisma.legalDocumentVersion.upsert({
    where: {
      legalDocumentId_version: { legalDocumentId: doc.id, version },
    },
    update: {
      title,
      content,
      changelog,
      status: "draft",
      createdByUserId: userId,
    },
    create: {
      legalDocumentId: doc.id,
      version,
      title,
      content,
      changelog,
      validFrom: new Date(),
      status: "draft",
      createdByUserId: userId,
    },
  });

  revalidatePath("/admin/einstellungen/recht");
  revalidatePath(`/admin/einstellungen/recht/${type}`);
}

export async function publishLegalVersionAction(formData: FormData) {
  const { userId, organizationId } = await requireLegalWrite();
  const type = String(formData.get("type") ?? "") as LegalDocumentType;
  const version = String(formData.get("version") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  const changelog = String(formData.get("changelog") ?? "").trim() || null;
  if (!LEGAL_DOCUMENT_TYPES.includes(type) || !version || !title) {
    throw new Error("VALIDATION");
  }

  const doc = await prisma.legalDocument.upsert({
    where: { organizationId_type: { organizationId, type } },
    update: { enabled: true },
    create: { organizationId, type, enabled: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.legalDocumentVersion.updateMany({
      where: { legalDocumentId: doc.id, status: "published" },
      data: { status: "archived" },
    });

    await tx.legalDocumentVersion.upsert({
      where: {
        legalDocumentId_version: { legalDocumentId: doc.id, version },
      },
      update: {
        title,
        content,
        changelog,
        status: "published",
        publishedAt: new Date(),
        validFrom: new Date(),
        createdByUserId: userId,
      },
      create: {
        legalDocumentId: doc.id,
        version,
        title,
        content,
        changelog,
        validFrom: new Date(),
        status: "published",
        publishedAt: new Date(),
        createdByUserId: userId,
      },
    });
  });

  revalidatePath("/admin/einstellungen/recht");
  revalidatePath(`/admin/einstellungen/recht/${type}`);
  revalidatePath("/recht", "layout");
}
