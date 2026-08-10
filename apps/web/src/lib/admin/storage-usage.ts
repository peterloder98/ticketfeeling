import { prisma } from "@/lib/db";

/** Neon Free default — raise via env when on Launch / Scale. */
const DEFAULT_LIMIT_GB = 0.5;
const CACHE_TTL_MS = 60_000;
const WARN_FREE_RATIO = 0.1;

export type StorageCategoryId =
  | "uploads"
  | "stripe_originals"
  | "seats"
  | "orders_tickets"
  | "system_jobs"
  | "other";

export type StorageCategory = {
  id: StorageCategoryId;
  label: string;
  bytes: number;
  percentOfUsed: number;
  tables: string[];
};

export type StorageUsageSnapshot = {
  databaseBytes: number;
  limitBytes: number;
  usedBytes: number;
  freeBytes: number;
  percentUsed: number;
  percentFree: number;
  warnLowStorage: boolean;
  categories: StorageCategory[];
  uploads: {
    count: number;
    avgBytes: number | null;
  };
  measuredAt: string;
  limitSource: "STORAGE_LIMIT_BYTES" | "NEON_STORAGE_LIMIT_GB" | "default";
};

const CATEGORY_DEFS: Array<{
  id: Exclude<StorageCategoryId, "other">;
  label: string;
  tables: string[];
}> = [
  {
    id: "uploads",
    label: "Bilder / Uploads",
    tables: ["uploaded_assets"],
  },
  {
    id: "stripe_originals",
    label: "Stripe-Originale",
    tables: ["stripe_original_uploads"],
  },
  {
    id: "seats",
    label: "Saalplätze",
    tables: ["event_seats", "venue_plans"],
  },
  {
    id: "orders_tickets",
    label: "Bestellungen / Tickets",
    tables: [
      "orders",
      "order_items",
      "order_legal_acceptances",
      "tickets",
      "ticket_qr_tokens",
      "ticket_wallet_passes",
      "payments",
      "invoices",
      "invoice_items",
      "customers",
      "carts",
      "cart_items",
      "checkin_events",
      "inventory_pools",
      "inventory_holds",
    ],
  },
  {
    id: "system_jobs",
    label: "System / Jobs",
    tables: [
      "background_jobs",
      "webhook_inbox",
      "audit_logs",
      "email_deliveries",
      "tracking_sessions",
      "tracking_events",
      "tracking_deliveries",
      "stripe_webhook_events",
      "stripe_payout_reconcile_runs",
      "stripe_balance_transactions",
      "stripe_payouts",
      "payout_documents",
      "payout_audit_logs",
    ],
  },
];

let cache: { at: number; value: StorageUsageSnapshot } | null = null;

export function formatBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let n = safe;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const formatted = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: i === 0 ? 0 : n >= 10 ? 1 : 2,
    minimumFractionDigits: 0,
  }).format(n);
  return `${formatted}\u00a0${units[i]}`;
}

export function resolveStorageLimit(): {
  limitBytes: number;
  limitSource: StorageUsageSnapshot["limitSource"];
} {
  const bytesRaw = process.env.STORAGE_LIMIT_BYTES?.trim();
  if (bytesRaw && /^\d+$/.test(bytesRaw)) {
    const limitBytes = Number(bytesRaw);
    if (limitBytes > 0) {
      return { limitBytes, limitSource: "STORAGE_LIMIT_BYTES" };
    }
  }

  const gbRaw = process.env.NEON_STORAGE_LIMIT_GB?.trim();
  if (gbRaw) {
    const gb = Number(gbRaw.replace(",", "."));
    if (Number.isFinite(gb) && gb > 0) {
      return {
        limitBytes: Math.round(gb * 1024 * 1024 * 1024),
        limitSource: "NEON_STORAGE_LIMIT_GB",
      };
    }
  }

  return {
    limitBytes: Math.round(DEFAULT_LIMIT_GB * 1024 * 1024 * 1024),
    limitSource: "default",
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function measureStorageUsageUncached(): Promise<StorageUsageSnapshot> {
  const { limitBytes, limitSource } = resolveStorageLimit();

  const [dbSizeRows, sizeRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ database_bytes: unknown }>>(
      `SELECT pg_database_size(current_database()) AS database_bytes`,
    ),
    prisma.$queryRawUnsafe<Array<{ table_name: string; total_bytes: unknown }>>(
      `SELECT c.relname AS table_name,
              pg_total_relation_size(c.oid) AS total_bytes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'`,
    ),
  ]);

  const databaseBytes = Math.max(0, toNumber(dbSizeRows[0]?.database_bytes));

  const sizeByTable = new Map<string, number>();
  for (const row of sizeRows) {
    sizeByTable.set(row.table_name, Math.max(0, toNumber(row.total_bytes)));
  }

  const categories: StorageCategory[] = [];
  let categorizedBytes = 0;
  const seen = new Set<string>();

  for (const def of CATEGORY_DEFS) {
    const present: string[] = [];
    let bytes = 0;
    for (const table of def.tables) {
      const size = sizeByTable.get(table);
      if (size == null) continue;
      present.push(table);
      bytes += size;
      seen.add(table);
    }
    categorizedBytes += bytes;
    categories.push({
      id: def.id,
      label: def.label,
      bytes,
      percentOfUsed: 0,
      tables: present.length ? present : def.tables,
    });
  }

  const otherBytes = Math.max(0, databaseBytes - categorizedBytes);
  categories.push({
    id: "other",
    label: "Sonstiges",
    bytes: otherBytes,
    percentOfUsed: 0,
    tables: [...sizeByTable.keys()].filter((name) => !seen.has(name)).sort(),
  });

  const usedBytes = databaseBytes;
  const freeBytes = Math.max(0, limitBytes - usedBytes);
  const percentUsed = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;
  const percentFree = limitBytes > 0 ? (freeBytes / limitBytes) * 100 : 0;
  const warnLowStorage = limitBytes > 0 && freeBytes / limitBytes <= WARN_FREE_RATIO;

  for (const cat of categories) {
    cat.percentOfUsed = usedBytes > 0 ? (cat.bytes / usedBytes) * 100 : 0;
  }

  categories.sort((a, b) => b.bytes - a.bytes);

  let uploads = { count: 0, avgBytes: null as number | null };
  if (sizeByTable.has("uploaded_assets")) {
    try {
      const assetRows = await prisma.$queryRawUnsafe<
        Array<{ count: unknown; avg_bytes: unknown }>
      >(
        `SELECT COUNT(*)::bigint AS count,
                AVG(byte_size)::float AS avg_bytes
         FROM uploaded_assets`,
      );
      const count = Math.max(0, Math.floor(toNumber(assetRows[0]?.count)));
      const avg = assetRows[0]?.avg_bytes == null ? null : toNumber(assetRows[0].avg_bytes);
      uploads = {
        count,
        avgBytes: count > 0 && avg != null && Number.isFinite(avg) ? avg : null,
      };
    } catch {
      // Column/table quirks — relation size is enough.
    }
  }

  return {
    databaseBytes,
    limitBytes,
    usedBytes,
    freeBytes,
    percentUsed,
    percentFree,
    warnLowStorage,
    categories,
    uploads,
    measuredAt: new Date().toISOString(),
    limitSource,
  };
}

export async function getStorageUsage(options?: {
  bypassCache?: boolean;
}): Promise<StorageUsageSnapshot> {
  if (!options?.bypassCache && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  const value = await measureStorageUsageUncached();
  cache = { at: Date.now(), value };
  return value;
}

/** Test helper — clears the in-process cache. */
export function clearStorageUsageCache() {
  cache = null;
}
