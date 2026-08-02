import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { LEGAL_SEED_CATALOG } from "@/lib/legal/content/catalog";
import { LEGAL_DOCUMENT_TYPES } from "@/lib/legal/document-types";

/** Best-effort schema patch when migrate deploy has not run yet. */
export async function ensureLegalSchema(db: PrismaClient = defaultPrisma) {
  // Prefer direct/unpooled URL for DDL (Neon pooler can reject ALTER).
  const directUrl =
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null;

  let ddlDb: PrismaClient = db;
  let owned: PrismaClient | null = null;
  if (directUrl && directUrl !== process.env.DATABASE_URL) {
    try {
      const { PrismaClient: PrismaClientCtor } = await import("@prisma/client");
      owned = new PrismaClientCtor({ datasources: { db: { url: directUrl } } });
      ddlDb = owned;
    } catch (error) {
      console.error("[legal] direct DDL client unavailable", error);
    }
  }

  const statements = [
    `ALTER TABLE "legal_documents" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "changelog" TEXT`,
    `ALTER TABLE "legal_document_versions" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID`,
  ];
  for (const sql of statements) {
    try {
      await ddlDb.$executeRawUnsafe(sql);
    } catch (error) {
      console.error("[legal] ensureLegalSchema statement failed", sql, error);
    }
  }
  if (owned) {
    await owned.$disconnect().catch(() => undefined);
  }
}

/** Load published version; works even if `enabled` column was just added. */
export async function findPublishedLegalVersion(
  organizationId: string,
  docType: string,
  db: PrismaClient = defaultPrisma,
) {
  await ensureLegalSchema(db);

  try {
    return await db.legalDocumentVersion.findFirst({
      where: {
        status: "published",
        legalDocument: { organizationId, type: docType, enabled: true },
      },
      orderBy: { publishedAt: "desc" },
    });
  } catch (error) {
    console.error("[legal] find with enabled failed, retrying raw", error);
  }

  // Raw fallback — does not require Prisma to map the enabled column.
  const rows = await db.$queryRawUnsafe<
    Array<{
      id: string;
      version: string;
      title: string;
      content: string;
      published_at: Date | null;
    }>
  >(
    `SELECT v.id, v.version, v.title, v.content, v.published_at
     FROM legal_document_versions v
     INNER JOIN legal_documents d ON d.id = v.legal_document_id
     WHERE d.organization_id = $1::uuid
       AND d.type = $2
       AND v.status = 'published'
       AND (NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name = 'legal_documents' AND column_name = 'enabled'
           ) OR d.enabled IS DISTINCT FROM false)
     ORDER BY v.published_at DESC NULLS LAST
     LIMIT 1`,
    organizationId,
    docType,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    content: row.content,
    publishedAt: row.published_at,
  };
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
