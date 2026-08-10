import { describe, expect, it } from "vitest";
import { withPrismaPoolParams } from "@/lib/db/database-url";

describe("withPrismaPoolParams", () => {
  it("adds pgbouncer + pool defaults for Supabase transaction pooler", () => {
    const out = withPrismaPoolParams(
      "postgresql://postgres.ref:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?schema=public",
    );
    expect(out).toContain("pgbouncer=true");
    expect(out).toContain("connection_limit=10");
    expect(out).toContain("pool_timeout=20");
    expect(out).toContain("connect_timeout=15");
    expect(out).toContain("schema=public");
    expect(out).toContain("postgres.ref:secret@");
  });

  it("overrides low explicit connection_limit on pooler URLs", () => {
    const out = withPrismaPoolParams(
      "postgresql://u:p@host.pooler.supabase.com:6543/db?pgbouncer=true&connection_limit=5&pool_timeout=10",
    );
    expect(out).toContain("connection_limit=10");
    expect(out).toContain("pool_timeout=20");
    expect(out).toContain("pgbouncer=true");
  });

  it("respects PRISMA_CONNECTION_LIMIT env override", () => {
    const prev = process.env.PRISMA_CONNECTION_LIMIT;
    process.env.PRISMA_CONNECTION_LIMIT = "8";
    try {
      const out = withPrismaPoolParams(
        "postgresql://u:p@host.pooler.supabase.com:6543/db",
      );
      expect(out).toContain("connection_limit=8");
    } finally {
      if (prev === undefined) delete process.env.PRISMA_CONNECTION_LIMIT;
      else process.env.PRISMA_CONNECTION_LIMIT = prev;
    }
  });

  it("uses connection_limit=1 for serverless direct (non-pooler) hosts", () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const out = withPrismaPoolParams(
        "postgresql://u:p@ep-cool-name.eu-central-1.aws.neon.tech:5432/neondb?schema=public",
      );
      expect(out).toContain("connection_limit=1");
      expect(out).not.toContain("pgbouncer=true");
    } finally {
      if (prev === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
    }
  });

  it("adds pgbouncer for Neon pooler hosts", () => {
    const out = withPrismaPoolParams(
      "postgresql://u:p@ep-cool-name-pooler.eu-central-1.aws.neon.tech:5432/neondb",
    );
    expect(out).toContain("pgbouncer=true");
    expect(out).toContain("connection_limit=10");
  });

  it("leaves local direct URLs unchanged when not serverless", () => {
    const prev = process.env.VERCEL;
    const prevEnv = process.env.VERCEL_ENV;
    const prevTf = process.env.TF_PRISMA_POOL;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.TF_PRISMA_POOL;
    try {
      const raw = "postgresql://peterloder@localhost:5432/ticketfeeling?schema=public";
      expect(withPrismaPoolParams(raw)).toBe(raw);
    } finally {
      if (prev !== undefined) process.env.VERCEL = prev;
      else delete process.env.VERCEL;
      if (prevEnv !== undefined) process.env.VERCEL_ENV = prevEnv;
      else delete process.env.VERCEL_ENV;
      if (prevTf !== undefined) process.env.TF_PRISMA_POOL = prevTf;
      else delete process.env.TF_PRISMA_POOL;
    }
  });
});
