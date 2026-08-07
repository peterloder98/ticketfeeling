import { describe, expect, it } from "vitest";
import { shouldSkipRuntimeDdl } from "@/lib/db/runtime-ddl";
import { authorizeCron } from "@/lib/cron-auth";

describe("shouldSkipRuntimeDdl", () => {
  const prev = {
    ALLOW_RUNTIME_DDL: process.env.ALLOW_RUNTIME_DDL,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };

  function restore() {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  it("skips on VERCEL=1", () => {
    delete process.env.ALLOW_RUNTIME_DDL;
    process.env.VERCEL = "1";
    delete process.env.VERCEL_ENV;
    expect(shouldSkipRuntimeDdl()).toBe(true);
    restore();
  });

  it("allows override with ALLOW_RUNTIME_DDL=1", () => {
    process.env.ALLOW_RUNTIME_DDL = "1";
    process.env.VERCEL = "1";
    expect(shouldSkipRuntimeDdl()).toBe(false);
    restore();
  });
});

describe("authorizeCron Bearer-only", () => {
  const prev = process.env.CRON_SECRET;

  it("accepts Bearer and rejects query secret", () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const ok = new Request("https://example.com/cron", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    expect(authorizeCron(ok)).toBe("ok");

    const query = new Request("https://example.com/cron?secret=test-cron-secret");
    expect(authorizeCron(query)).toBe("unauthorized");

    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });
});
