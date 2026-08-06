type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * In-process rate limit (best-effort).
 *
 * Multi-instance gap: each Vercel/Node isolate keeps its own Map — limits do not
 * aggregate across instances. Prefer Upstash/Redis when available; until then this
 * still blunts single-instance abuse (promo brute-force, checkout spam, login).
 * Do not block deploys on Redis configuration.
 *
 * Env (optional, future): UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN —
 * not wired yet (no Redis client in dependencies).
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

export function takeRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
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

export function clientIpFromRequest(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}
