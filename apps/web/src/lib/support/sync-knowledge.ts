import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import {
  SUPPORT_KNOWLEDGE_ARTICLES_DE,
  SUPPORT_KNOWLEDGE_MANAGED_SLUGS,
  SUPPORT_KNOWLEDGE_SEED_VERSION,
} from "@/lib/support/knowledge-articles";

const syncedKeys = new Set<string>();

export async function syncSupportKnowledge(
  organizationId: string,
  db: PrismaClient = defaultPrisma,
): Promise<{ upserted: number; pruned: number }> {
  const locale = "de-DE";
  const now = new Date();
  let upserted = 0;

  for (const article of SUPPORT_KNOWLEDGE_ARTICLES_DE) {
    await db.supportKnowledgeArticle.upsert({
      where: {
        organizationId_slug_locale: {
          organizationId,
          slug: article.slug,
          locale,
        },
      },
      update: {
        title: article.title,
        body: article.body,
        tags: article.tags,
        status: "published",
        visibility: "public",
        publishedAt: now,
      },
      create: {
        organizationId,
        slug: article.slug,
        title: article.title,
        body: article.body,
        tags: article.tags,
        locale,
        status: "published",
        visibility: "public",
        publishedAt: now,
      },
    });
    upserted += 1;
  }

  const currentSlugs = SUPPORT_KNOWLEDGE_ARTICLES_DE.map((a) => a.slug);
  const pruneResult = await db.supportKnowledgeArticle.deleteMany({
    where: {
      organizationId,
      locale,
      slug: {
        in: SUPPORT_KNOWLEDGE_MANAGED_SLUGS.filter((s) => !currentSlugs.includes(s)),
      },
    },
  });

  return { upserted, pruned: pruneResult.count };
}

/**
 * Best-effort: keep published FAQ in sync with code after deploy (once per process/version).
 */
export async function ensureSupportKnowledge(
  organizationId: string,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  const key = `${organizationId}:v${SUPPORT_KNOWLEDGE_SEED_VERSION}`;
  if (syncedKeys.has(key)) return;
  try {
    await syncSupportKnowledge(organizationId, db);
    syncedKeys.add(key);
  } catch {
    // Don't break /hilfe or chat if sync fails (DB blip) — existing articles still serve.
  }
}

export async function syncSupportKnowledgeForActiveOrgs(
  db: PrismaClient = defaultPrisma,
): Promise<number> {
  const orgs = await db.organization.findMany({
    where: { status: "active" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  for (const org of orgs) {
    await syncSupportKnowledge(org.id, db);
    syncedKeys.add(`${org.id}:v${SUPPORT_KNOWLEDGE_SEED_VERSION}`);
  }
  return orgs.length;
}
