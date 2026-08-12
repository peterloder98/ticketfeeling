import { prisma } from "@/lib/db";

/** Neon Free default — raise via env when on Launch / Scale. */
const DEFAULT_LIMIT_GB = 0.5;
const CACHE_TTL_MS = 60_000;
const WARN_FREE_RATIO = 0.1;
const OTHER_TOP_TABLES = 8;

export type StorageCategoryId =
  | "uploads"
  | "stripe_originals"
  | "seats"
  | "orders_tickets"
  | "catalog"
  | "org_auth"
  | "system_jobs"
  | "other";

export type StorageBreakdownItem = {
  id: string;
  label: string;
  description: string;
  bytes: number;
  /** Technical table name when this row is a single relation. */
  table?: string;
};

export type StorageCategory = {
  id: StorageCategoryId;
  label: string;
  description: string;
  bytes: number;
  percentOfUsed: number;
  tables: string[];
  /** Extra rows under Sonstiges (top tables, Migrations, Overhead). */
  breakdown?: StorageBreakdownItem[];
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
  /** Heap / Index / TOAST across all measured public tables (informational). */
  structure: {
    heapBytes: number;
    indexBytes: number;
    toastBytes: number;
  };
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
  description: string;
  tables: string[];
}> = [
  {
    id: "uploads",
    label: "Bilder / Uploads",
    description: "Eventcover, Künstlerfotos und andere Dateien in der Datenbank.",
    tables: ["uploaded_assets"],
  },
  {
    id: "stripe_originals",
    label: "Stripe-Originale",
    description: "Hochgeladene Stripe-Rohdateien für den Auszahlungsabgleich.",
    tables: ["stripe_original_uploads"],
  },
  {
    id: "seats",
    label: "Saalplätze",
    description: "Sitzpläne und einzelne Event-Plätze (oft viele Zeilen).",
    tables: ["event_seats", "venue_plans"],
  },
  {
    id: "orders_tickets",
    label: "Bestellungen / Tickets",
    description: "Bestellungen, Tickets, QR, Rechnungen, Warenkörbe und Zahlungen.",
    tables: [
      "orders",
      "order_items",
      "order_legal_acceptances",
      "tickets",
      "ticket_qr_tokens",
      "ticket_wallet_passes",
      "apple_wallet_device_registrations",
      "payments",
      "invoices",
      "invoice_items",
      "invoice_number_sequences",
      "customers",
      "carts",
      "cart_items",
      "checkin_events",
      "inventory_pools",
      "inventory_holds",
      "discount_codes",
      "gift_cards",
      "fiscal_transactions",
      "box_office_sessions",
    ],
  },
  {
    id: "catalog",
    label: "Katalog / Events",
    description: "Events, Touren, Künstler, Locations und Ticketkategorien.",
    tables: [
      "events",
      "tours",
      "tour_artists",
      "artists",
      "locations",
      "location_rooms",
      "event_artists",
      "event_ticket_categories",
      "event_price_campaigns",
      "event_price_campaign_categories",
      "ticket_category_templates",
      "tax_rates",
    ],
  },
  {
    id: "org_auth",
    label: "Organisation / Zugang",
    description: "Organisationen, Benutzer, Rollen, Einladungen und Einstellungen.",
    tables: [
      "organizations",
      "organization_settings",
      "organization_email_accounts",
      "organization_bank_accounts",
      "users",
      "accounts",
      "sessions",
      "verification_tokens",
      "memberships",
      "roles",
      "permissions",
      "role_permissions",
      "membership_roles",
      "staff_invites",
      "box_office_invites",
      "box_office_invite_events",
      "box_office_seller_grants",
    ],
  },
  {
    id: "system_jobs",
    label: "System / Jobs",
    description:
      "Hintergrundjobs, Webhooks, Audit, E-Mail- und Tracking-Protokolle, Stripe-Abgleich.",
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
      "payout_document_sequences",
      "payout_audit_logs",
      "support_knowledge_articles",
      "support_chat_sessions",
      "support_chat_messages",
      "support_requests",
      "forgotten_ticket_requests",
      "access_recovery_tokens",
      "ticket_resend_events",
      "legal_documents",
      "legal_document_versions",
    ],
  },
];

/** Calm German labels for tables that may still land in Sonstiges. */
const TABLE_LABELS: Record<string, { label: string; description: string }> = {
  _prisma_migrations: {
    label: "Prisma-Migrationen",
    description: "Verlauf der Datenbank-Schema-Updates — normal und meist klein.",
  },
  events: {
    label: "Events",
    description: "Event-Stammdaten und Verkaufseinstellungen.",
  },
  organizations: {
    label: "Organisationen",
    description: "Mandanten und Basisdaten.",
  },
  users: {
    label: "Benutzer",
    description: "Login-Konten und Profilfelder.",
  },
  artists: {
    label: "Künstler",
    description: "Künstlerprofile und Bios.",
  },
  locations: {
    label: "Locations",
    description: "Spielstätten und Adressen.",
  },
  tours: {
    label: "Touren",
    description: "Tour-Projekte mit mehreren Terminen.",
  },
};

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

function tableMeta(name: string): { label: string; description: string } {
  const known = TABLE_LABELS[name];
  if (known) return known;
  return {
    label: name,
    description: "Weitere Tabelle in der öffentlichen Datenbank.",
  };
}

type TableSizeRow = {
  table_name: string;
  total_bytes: number;
  heap_bytes: number;
  index_bytes: number;
  toast_bytes: number;
};

function buildOtherBreakdown(
  otherTables: TableSizeRow[],
  residualBytes: number,
  structure: { heapBytes: number; indexBytes: number; toastBytes: number },
): StorageBreakdownItem[] {
  const items: StorageBreakdownItem[] = [];
  const sorted = [...otherTables].sort((a, b) => b.total_bytes - a.total_bytes);
  const top = sorted.slice(0, OTHER_TOP_TABLES);
  const rest = sorted.slice(OTHER_TOP_TABLES);
  const restBytes = rest.reduce((sum, row) => sum + row.total_bytes, 0);

  for (const row of top) {
    const meta = tableMeta(row.table_name);
    const parts: string[] = [];
    if (row.index_bytes > 0 && row.index_bytes / Math.max(1, row.total_bytes) >= 0.25) {
      parts.push(`davon ${formatBytes(row.index_bytes)} Indizes`);
    }
    if (row.toast_bytes > 0 && row.toast_bytes / Math.max(1, row.total_bytes) >= 0.15) {
      parts.push(`davon ${formatBytes(row.toast_bytes)} TOAST (große Felder)`);
    }
    items.push({
      id: `table:${row.table_name}`,
      label: meta.label,
      description: parts.length ? `${meta.description} ${parts.join(" · ")}.` : meta.description,
      bytes: row.total_bytes,
      table: row.table_name,
    });
  }

  if (restBytes > 0) {
    items.push({
      id: "other_tables_rest",
      label: "Weitere kleine Tabellen",
      description: `${rest.length} Tabellen unterhalb der Top-Liste.`,
      bytes: restBytes,
    });
  }

  if (residualBytes > 0) {
    const indexShare =
      structure.indexBytes > 0
        ? ` Indizes über alle Tabellen: ${formatBytes(structure.indexBytes)} (sind in den Bereichen oben schon eingerechnet).`
        : "";
    const toastShare =
      structure.toastBytes > 0
        ? ` TOAST (große Textfelder): ${formatBytes(structure.toastBytes)} — ebenfalls in den Tabellengrößen enthalten.`
        : "";
    items.push({
      id: "postgres_overhead",
      label: "Postgres-Überhang",
      description: `Differenz zwischen gesamter Datenbankgröße und Summe der öffentlichen Tabellen (Sequenzen, Systemkataloge, Freispeicher).${indexShare}${toastShare}`,
      bytes: residualBytes,
    });
  }

  return items;
}

async function measureStorageUsageUncached(): Promise<StorageUsageSnapshot> {
  const { limitBytes, limitSource } = resolveStorageLimit();

  const [dbSizeRows, sizeRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ database_bytes: unknown }>>(
      `SELECT pg_database_size(current_database()) AS database_bytes`,
    ),
    prisma.$queryRawUnsafe<
      Array<{
        table_name: string;
        total_bytes: unknown;
        heap_bytes: unknown;
        index_bytes: unknown;
        toast_bytes: unknown;
      }>
    >(
      `SELECT c.relname AS table_name,
              pg_total_relation_size(c.oid) AS total_bytes,
              pg_relation_size(c.oid) AS heap_bytes,
              pg_indexes_size(c.oid) AS index_bytes,
              GREATEST(
                0,
                pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid)
              ) AS toast_bytes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'`,
    ),
  ]);

  const databaseBytes = Math.max(0, toNumber(dbSizeRows[0]?.database_bytes));

  const tables: TableSizeRow[] = sizeRows.map((row) => ({
    table_name: row.table_name,
    total_bytes: Math.max(0, toNumber(row.total_bytes)),
    heap_bytes: Math.max(0, toNumber(row.heap_bytes)),
    index_bytes: Math.max(0, toNumber(row.index_bytes)),
    toast_bytes: Math.max(0, toNumber(row.toast_bytes)),
  }));

  const sizeByTable = new Map(tables.map((t) => [t.table_name, t]));
  const allTablesBytes = tables.reduce((sum, t) => sum + t.total_bytes, 0);
  const structure = {
    heapBytes: tables.reduce((sum, t) => sum + t.heap_bytes, 0),
    indexBytes: tables.reduce((sum, t) => sum + t.index_bytes, 0),
    toastBytes: tables.reduce((sum, t) => sum + t.toast_bytes, 0),
  };
  const residualBytes = Math.max(0, databaseBytes - allTablesBytes);

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
      bytes += size.total_bytes;
      seen.add(table);
    }
    categorizedBytes += bytes;
    categories.push({
      id: def.id,
      label: def.label,
      description: def.description,
      bytes,
      percentOfUsed: 0,
      tables: present.length ? present : def.tables,
    });
  }

  const otherTableRows = tables.filter((t) => !seen.has(t.table_name));
  const otherTablesBytes = otherTableRows.reduce((sum, t) => sum + t.total_bytes, 0);
  const otherBytes = Math.max(0, databaseBytes - categorizedBytes);
  const breakdown = buildOtherBreakdown(otherTableRows, residualBytes, structure);

  // Prefer measured table+residual sum when it matches; keep DB residual accurate.
  const otherBytesResolved =
    otherTablesBytes + residualBytes > 0 ? otherTablesBytes + residualBytes : otherBytes;

  categories.push({
    id: "other",
    label: "Sonstiges",
    description:
      otherTableRows.some((t) => t.table_name === "_prisma_migrations") &&
      (sizeByTable.get("_prisma_migrations")?.total_bytes ?? 0) >= otherBytesResolved * 0.2
        ? "Vor allem Schema-Migrationen und Tabellen außerhalb der Hauptbereiche — siehe Aufschlüsselung."
        : residualBytes >= otherBytesResolved * 0.35
          ? "Zum großen Teil Postgres-Überhang (Sequenzen/System) sowie kleinere Resttabellen — Indizes und TOAST stecken schon in den Bereichen oben."
          : "Restliche Tabellen und ggf. Postgres-Überhang — Details in der Aufschlüsselung.",
    bytes: otherBytesResolved,
    percentOfUsed: 0,
    tables: otherTableRows.map((t) => t.table_name).sort(),
    breakdown,
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
    structure,
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
  // Always plain JSON — BigInt from pg_* size functions must never reach RSC Flight.
  const plain = JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)),
  ) as StorageUsageSnapshot;
  cache = { at: Date.now(), value: plain };
  return plain;
}

/** Test helper — clears the in-process cache. */
export function clearStorageUsageCache() {
  cache = null;
}
