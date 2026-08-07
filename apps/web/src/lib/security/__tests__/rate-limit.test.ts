import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isRedisRateLimitConfigured,
  takeRateLimit,
} from "@/lib/security/rate-limit";

describe("rate-limit", () => {
  const env = { ...process.env };

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("reports redis unconfigured without REST env", () => {
    expect(isRedisRateLimitConfigured()).toBe(false);
  });

  it("falls back to memory when Redis unset", async () => {
    const key = `test-mem-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      const r = await takeRateLimit({ key, limit: 3, windowMs: 60_000 });
      expect(r.ok).toBe(true);
    }
    const blocked = await takeRateLimit({ key, limit: 3, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("uses Upstash REST when configured", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    expect(isRedisRateLimitConfigured()).toBe(true);

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/pipeline")) {
        return {
          ok: true,
          json: async () => [
            [null, 1],
            [null, -1],
          ],
        };
      }
      return { ok: true, json: async () => [null, 1] };
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await takeRateLimit({
      key: `test-redis-${Date.now()}`,
      limit: 5,
      windowMs: 60_000,
    });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});
