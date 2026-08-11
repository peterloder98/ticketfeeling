type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * Rate limit (best-effort).
 *
 * Backend priority:
 * 1. Upstash / Vercel KV REST (`UPSTASH_REDIS_REST_*` or `KV_REST_API_*`) — shared across instances
 * 2. In-process Map — single isolate only
 *
 * `REDIS_URL` (TCP) is documented for local Redis but not required; serverless
 * prefers REST. Missing Redis never fails the request — we fall back to memory.
 */
function prune(now: number) {
  if (buckets.size < 2000) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/** Default windows used by public commerce routes (documented for ops). */
export const RATE_LIMIT_PRESETS = {
  /** Promo / gift-card guessing */
  promo: { limit: 12, windowMs: 60 * 1000 },
  /** Add-to-cart bursts */
  cartAdd: { limit: 40, windowMs: 60 * 1000 },
  /** Checkout confirm */
  checkout: { limit: 12, windowMs: 10 * 60 * 1000 },
  /** Credential login */
  login: { limit: 8, windowMs: 15 * 60 * 1000 },
} as const;

function redisRestCredentials(): { url: string; token: string } | null {
  const url = (
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    "";
  if (!url || !token) return null;
  return { url, token };
}

/** True when shared Redis REST is configured (ops / health). */
export function isRedisRateLimitConfigured(): boolean {
  return redisRestCredentials() != null;
}

async function takeRateLimitRedis(input: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult | null> {
  const creds = redisRestCredentials();
  if (!creds) return null;

  const redisKey = `tf:rl:${input.key}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);

  try {
    const pipelineRes = await fetch(`${creds.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PTTL", redisKey],
      ]),
      signal: controller.signal,
    });
    if (!pipelineRes.ok) return null;

    const rows = (await pipelineRes.json()) as Array<[string | null, number]>;
    const count = Number(rows?.[0]?.[1]);
    let pttl = Number(rows?.[1]?.[1]);
    if (!Number.isFinite(count) || count < 1) return null;

    if (count === 1 || !Number.isFinite(pttl) || pttl < 0) {
      await fetch(`${creds.url}/pexpire/${encodeURIComponent(redisKey)}/${input.windowMs}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.token}` },
        signal: controller.signal,
      });
      pttl = input.windowMs;
    }

    if (count > input.limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((Number.isFinite(pttl) ? pttl : input.windowMs) / 1000)),
      };
    }
    return { ok: true };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function takeRateLimitMemory(input: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(input.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return { ok: true };
  }
  if (existing.count >= input.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { ok: true };
}

/**
 * Prefer Redis REST when configured; otherwise in-memory.
 * Safe to await from route handlers / authorize().
 */
export async function takeRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const fromRedis = await takeRateLimitRedis(input);
  if (fromRedis) return fromRedis;
  return takeRateLimitMemory(input);
}

export {
  clientIpFromRequest,
  normalizePublicClientIp,
  isPublicClientIp,
} from "@/lib/security/client-ip";
