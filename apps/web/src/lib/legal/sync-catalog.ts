import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { LEGAL_SEED_CATALOG } from "@/lib/legal/content/catalog";
import { LEGAL_DOCUMENT_TYPES } from "@/lib/legal/document-types";

type PublishedLegalVersion = {
  id: string;
  version: string;
  title: string;
  content: string;
  publishedAt: Date | null;
};

async function columnExists(
  db: PrismaClient,
  table: string,
  column: string,
): Promise<boolean> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
       ) AS exists`,
      table,
      column,
    );
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

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

async function findPublishedViaRaw(
  db: PrismaClient,
  organizationId: string,
  docType: string,
): Promise<PublishedLegalVersion | null> {
  const hasEnabled = await columnExists(db, "legal_documents", "enabled");
  const enabledClause = hasEnabled ? `AND COALESCE(d.enabled, true) = true` : "";

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
       ${enabledClause}
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

/** Load published version; never throws — returns null on schema/DB issues. */
export async function findPublishedLegalVersion(
  organizationId: string,
  docType: string,
  db: PrismaClient = defaultPrisma,
): Promise<PublishedLegalVersion | null> {
  try {
    await ensureLegalSchema(db);
  } catch (error) {
    console.error("[legal] ensureLegalSchema failed", error);
  }

  // Prefer raw read first: Prisma Client SELECTs `enabled`/`changelog` and 500s
  // when migrate deploy has not applied those columns yet.
  try {
    const raw = await findPublishedViaRaw(db, organizationId, docType);
    if (raw) return raw;
  } catch (error) {
    console.error("[legal] raw published lookup failed", error);
  }

  try {
    const hasEnabled = await columnExists(db, "legal_documents", "enabled");
    if (!hasEnabled) return null;

    return await db.legalDocumentVersion.findFirst({
      where: {
        status: "published",
        legalDocument: { organizationId, type: docType, enabled: true },
      },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        version: true,
        title: true,
        content: true,
        publishedAt: true,
      },
    });
  } catch (error) {
    console.error("[legal] prisma published lookup failed", error);
    return null;
  }
}

/** Ensure all legal document types exist and publish catalog versions when missing/outdated placeholders. */
export async function syncLegalCatalog(
  organizationId: string,
  db: PrismaClient = defaultPrisma,
) {
  await ensureLegalSchema(db);
  const hasEnabled = await columnExists(db, "legal_documents", "enabled");
  const hasChangelog = await columnExists(db, "legal_document_versions", "changelog");

  for (const type of LEGAL_DOCUMENT_TYPES) {
    if (hasEnabled) {
      await db.legalDocument.upsert({
        where: { organizationId_type: { organizationId, type } },
        update: {},
        create: { organizationId, type, enabled: true },
      });
    } else {
      await db.$executeRawUnsafe(
        `INSERT INTO legal_documents (id, organization_id, type, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2, NOW())
         ON CONFLICT (organization_id, type) DO NOTHING`,
        organizationId,
        type,
      );
    }
  }

  for (const doc of LEGAL_SEED_CATALOG) {
    const legalRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM legal_documents
       WHERE organization_id = $1::uuid AND type = $2
       LIMIT 1`,
      organizationId,
      doc.type,
    );
    const legal = legalRows[0];
    if (!legal?.id) continue;

    const existingRows = await db.$queryRawUnsafe<
      Array<{ id: string; published_at: Date | null }>
    >(
      `SELECT id, published_at FROM legal_document_versions
       WHERE legal_document_id = $1::uuid AND version = $2
       LIMIT 1`,
      legal.id,
      doc.version,
    );
    const existing = existingRows[0];

    await db.$executeRawUnsafe(
      `UPDATE legal_document_versions
       SET status = 'archived'
       WHERE legal_document_id = $1::uuid
         AND status = 'published'
         AND version <> $2`,
      legal.id,
      doc.version,
    );

    if (existing) {
      if (hasChangelog) {
        await db.$executeRawUnsafe(
          `UPDATE legal_document_versions
           SET title = $2, content = $3, changelog = $4, status = 'published',
               published_at = COALESCE(published_at, NOW())
           WHERE id = $1::uuid`,
          existing.id,
          doc.title,
          doc.content,
          doc.changelog,
        );
      } else {
        await db.$executeRawUnsafe(
          `UPDATE legal_document_versions
           SET title = $2, content = $3, status = 'published',
               published_at = COALESCE(published_at, NOW())
           WHERE id = $1::uuid`,
          existing.id,
          doc.title,
          doc.content,
        );
      }
    } else if (hasChangelog) {
      await db.$executeRawUnsafe(
        `INSERT INTO legal_document_versions
           (id, legal_document_id, version, title, content, changelog, valid_from, status, published_at, created_at)
         VALUES
           (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, NOW(), 'published', NOW(), NOW())`,
        legal.id,
        doc.version,
        doc.title,
        doc.content,
        doc.changelog,
      );
    } else {
      await db.$executeRawUnsafe(
        `INSERT INTO legal_document_versions
           (id, legal_document_id, version, title, content, valid_from, status, published_at, created_at)
         VALUES
           (gen_random_uuid(), $1::uuid, $2, $3, $4, NOW(), 'published', NOW(), NOW())`,
        legal.id,
        doc.version,
        doc.title,
        doc.content,
      );
    }
  }
}

/** Static catalog fallback when DB is unavailable or schema is behind. */
export function getSeedLegalVersion(docType: string): PublishedLegalVersion | null {
  const seed = LEGAL_SEED_CATALOG.find((d) => d.type === docType);
  if (!seed) return null;
  return {
    id: `seed:${seed.type}:${seed.version}`,
    version: seed.version,
    title: seed.title,
    content: seed.content,
    publishedAt: null,
  };
}
