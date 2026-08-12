import { prisma } from "@/lib/db";
import { shouldSkipRuntimeDdl } from "@/lib/db/runtime-ddl";

/** Weihnachtstraum 2026 dates — final; never show public „geänderter Termin“. */
export const WEIHNACHTSTRAUM_2026_SLUG_PREFIX = "schlagerfeeling-weihnachtstraum-2026-";

export function isWeihnachtstraum2026Slug(slug: string): boolean {
  return slug.startsWith(WEIHNACHTSTRAUM_2026_SLUG_PREFIX);
}

/**
 * Idempotent data fix: NULL scheduleChangedAt on Weihnachtstraum 2026 events.
 * Safe on every deploy / request — not DDL.
 */
export async function clearWeihnachtstraum2026ScheduleNotices(): Promise<number> {
  try {
    const result = await prisma.event.updateMany({
      where: {
        slug: { startsWith: WEIHNACHTSTRAUM_2026_SLUG_PREFIX },
        scheduleChangedAt: { not: null },
      },
      data: { scheduleChangedAt: null },
    });
    return result.count;
  } catch (err) {
    console.error("[clearWeihnachtstraum2026ScheduleNotices]", err);
    return 0;
  }
}

/** Best-effort DDL when migrate deploy lags (local/dev only) + always clear WT notices. */
export async function ensureScheduleChangedAtColumn() {
  if (!shouldSkipRuntimeDdl()) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "schedule_changed_at" TIMESTAMP(3)`,
      );
    } catch (err) {
      console.error("[ensureScheduleChangedAtColumn]", err);
    }
  }
  await clearWeihnachtstraum2026ScheduleNotices();
}
