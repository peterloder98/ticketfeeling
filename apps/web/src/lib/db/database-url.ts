/**
 * Normalize Postgres URL for Prisma on serverless (Vercel) + Supabase/Neon poolers.
 *
 * Prisma's default pool is ~num_cpus*2+1 (often 5) with pool_timeout=10s. Under
 * concurrent seat-map / cart / tracking in a warm isolate that exhausts quickly.
 * PgBouncer (port 6543 / *-pooler*) multiplexes client connections — raise the
 * Prisma-side limit modestly, never enough to stampede direct Postgres max_connections.
 */

const SERVERLESS_CONNECTION_LIMIT = "10";
const SERVERLESS_DIRECT_CONNECTION_LIMIT = "1";
const SERVERLESS_POOL_TIMEOUT = "20";
const SERVERLESS_CONNECT_TIMEOUT = "15";

function isPoolerHost(hostname: string, port: string | null): boolean {
  const host = hostname.toLowerCase();
  return (
    port === "6543" ||
    host.includes("-pooler.") ||
    host.includes(".pooler.") ||
    host.startsWith("pooler.")
  );
}

function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.TF_PRISMA_POOL === "1"
  );
}

/**
 * Append/override Prisma datasource URL query params without corrupting credentials.
 * Avoids `new URL()` on postgres URLs (special chars in passwords break parsing).
 */
export function withPrismaPoolParams(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;

  const qIndex = trimmed.indexOf("?");
  const base = qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed;
  const query = qIndex >= 0 ? trimmed.slice(qIndex + 1) : "";

  const params = new URLSearchParams(query);
  const hostPortMatch = base.match(/@([^/?]+)/);
  const hostPort = hostPortMatch?.[1] ?? "";
  const [hostname, port = null] = hostPort.includes(":")
    ? [hostPort.slice(0, hostPort.lastIndexOf(":")), hostPort.slice(hostPort.lastIndexOf(":") + 1)]
    : [hostPort, null];

  const pooler = isPoolerHost(hostname, port);
  const serverless = isServerlessRuntime();

  if (pooler) {
    params.set("pgbouncer", "true");
  }

  if (serverless || pooler) {
    // Pooler: modest multiplexed pool. Direct Neon/Postgres on serverless: 1 conn
    // (opening 10 direct sockets per isolate stamps out max_connections and adds seconds).
    const defaultLimit = pooler
      ? SERVERLESS_CONNECTION_LIMIT
      : SERVERLESS_DIRECT_CONNECTION_LIMIT;
    params.set(
      "connection_limit",
      process.env.PRISMA_CONNECTION_LIMIT?.trim() || defaultLimit,
    );
    params.set(
      "pool_timeout",
      process.env.PRISMA_POOL_TIMEOUT?.trim() || SERVERLESS_POOL_TIMEOUT,
    );
    params.set(
      "connect_timeout",
      process.env.PRISMA_CONNECT_TIMEOUT?.trim() || SERVERLESS_CONNECT_TIMEOUT,
    );
  }

  if (!params.has("schema")) {
    params.set("schema", "public");
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Datasource URL for the shared Prisma client (runtime queries). */
export function resolvePrismaDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }
  return withPrismaPoolParams(raw);
}

/** Direct (non-pooler) URL for migrations / DDL — never rewrite with pgbouncer. */
export function resolvePrismaDirectUrl(): string | undefined {
  const raw =
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING;
  return raw?.trim() || undefined;
}
