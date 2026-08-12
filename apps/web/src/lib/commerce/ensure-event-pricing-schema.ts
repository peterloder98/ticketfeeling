import type { PrismaClient } from "@prisma/client";
import { withTimeoutFallback } from "@/lib/async-timeout";
import { shouldSkipRuntimeDdl } from "@/lib/db/runtime-ddl";

const STATEMENTS = [
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_enabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_label" TEXT NOT NULL DEFAULT 'Rollstuhl / Ermäßigt'`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_description" TEXT`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_type" TEXT NOT NULL DEFAULT 'percent'`,
  `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "accessibility_discount_value" INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS "event_price_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "channels" TEXT NOT NULL DEFAULT 'both',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_price_campaigns_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "event_price_campaign_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    CONSTRAINT "event_price_campaign_categories_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "event_price_campaign_categories_campaign_id_category_id_key"
    ON "event_price_campaign_categories"("campaign_id", "category_id")`,
  `CREATE INDEX IF NOT EXISTS "event_price_campaign_categories_category_id_idx"
    ON "event_price_campaign_categories"("category_id")`,
  `CREATE INDEX IF NOT EXISTS "event_price_campaigns_event_id_active_valid_from_valid_until_idx"
    ON "event_price_campaigns"("event_id", "active", "valid_from", "valid_until")`,
  `ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "unit_list_gross_cents" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "accessibility_selected" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "price_campaign_id" UUID`,
  `ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "price_campaign_name" TEXT`,
  `ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "apply_mode" TEXT NOT NULL DEFAULT 'unit'`,
  `ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "min_quantity" INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "badge_label" TEXT`,
  `ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "badge_disclaimer" TEXT`,
  `ALTER TABLE "event_price_campaigns" ADD COLUMN IF NOT EXISTS "campaign_group_id" UUID`,
  `CREATE INDEX IF NOT EXISTS "event_price_campaigns_campaign_group_id_idx"
    ON "event_price_campaigns"("campaign_group_id")`,
];

const ENSURE_BUDGET_MS = 5_000;
/** Avoid information_schema probes on every event/cart click after a miss/skip. */
const PROBE_NEGATIVE_TTL_MS = 5 * 60 * 1000;

let ensurePromise: Promise<void> | null = null;
let schemaReady = false;
let lastIncompleteProbeAt = 0;

async function probeReady(db: PrismaClient): Promise<boolean> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'event_price_campaigns'
         AND column_name = 'campaign_group_id'`,
    );
    return (rows[0]?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Best-effort DDL when migrate deploy has not run yet (local/dev). Skipped in production. */
export async function ensureEventPricingSchema(db: PrismaClient) {
  if (schemaReady) return;
  // Production/Vercel: migrate-deploy owns schema — zero information_schema RTTs on clicks.
  if (shouldSkipRuntimeDdl()) {
    schemaReady = true;
    return;
  }
  // Negative cache: incomplete schema must not re-probe every request (non-prod).
  if (
    !ensurePromise &&
    lastIncompleteProbeAt > 0 &&
    Date.now() - lastIncompleteProbeAt < PROBE_NEGATIVE_TTL_MS
  ) {
    return;
  }
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (await probeReady(db)) {
        schemaReady = true;
        lastIncompleteProbeAt = 0;
        return;
      }
      for (const sql of STATEMENTS) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (err) {
          console.warn("[ensureEventPricingSchema]", err);
        }
      }
      // FKs best-effort (may already exist)
      for (const sql of [
        `ALTER TABLE "event_price_campaigns" ADD CONSTRAINT "event_price_campaigns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        `ALTER TABLE "event_price_campaign_categories" ADD CONSTRAINT "event_price_campaign_categories_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "event_price_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        `ALTER TABLE "event_price_campaign_categories" ADD CONSTRAINT "event_price_campaign_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "event_ticket_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      ]) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch {
          /* duplicate_object ok */
        }
      }
      schemaReady = await probeReady(db);
      if (!schemaReady) lastIncompleteProbeAt = Date.now();
      else lastIncompleteProbeAt = 0;
    })().finally(() => {
      ensurePromise = null;
    });
  }
  await withTimeoutFallback(ensurePromise, ENSURE_BUDGET_MS, undefined);
}
