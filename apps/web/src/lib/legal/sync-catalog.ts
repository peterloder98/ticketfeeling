import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { LEGAL_SEED_CATALOG } from "@/lib/legal/content/catalog";
import { LEGAL_DOCUMENT_TYPES } from "@/lib/legal/document-types";

/** Best-effort schema patch when migrate deploy has not run yet. */
async function ensureLegalSchema(db: PrismaClient) {
  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "changelog" TEXT`,
    );
    await db.$executeRawUnsafe(
      `ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID`,
    );
  } catch {
    /* ignore — table may not exist in fresh envs before migrate */
  }
}

/** Ensure all legal document types exist and publish catalog versions when missing/outdated placeholders. */
export async function syncLegalCatalog(
  organizationId: string,
  db: PrismaClient = defaultPrisma,
) {
  await ensureLegalSchema(db);
  for (const type of LEGAL_DOCUMENT_TYPES) {
    await db.legalDocument.upsert({
      where: { organizationId_type: { organizationId, type } },
      update: {},
      create: { organizationId, type, enabled: true },
    });
  }

  for (const doc of LEGAL_SEED_CATALOG) {
    const legal = await db.legalDocument.findUniqueOrThrow({
      where: { organizationId_type: { organizationId, type: doc.type } },
    });

    const existing = await db.legalDocumentVersion.findUnique({
      where: {
        legalDocumentId_version: {
          legalDocumentId: legal.id,
          version: doc.version,
        },
      },
    });

    // Archive other published versions when (re)publishing this catalog version.
    await db.legalDocumentVersion.updateMany({
      where: {
        legalDocumentId: legal.id,
        status: "published",
        NOT: { version: doc.version },
      },
      data: { status: "archived" },
    });

    if (existing) {
      await db.legalDocumentVersion.update({
        where: { id: existing.id },
        data: {
          title: doc.title,
          content: doc.content,
          changelog: doc.changelog,
          status: "published",
          publishedAt: existing.publishedAt ?? new Date(),
          validFrom: existing.validFrom,
        },
      });
    } else {
      await db.legalDocumentVersion.create({
        data: {
          legalDocumentId: legal.id,
          version: doc.version,
          title: doc.title,
          content: doc.content,
          changelog: doc.changelog,
          validFrom: new Date(),
          status: "published",
          publishedAt: new Date(),
        },
      });
    }
  }
}
