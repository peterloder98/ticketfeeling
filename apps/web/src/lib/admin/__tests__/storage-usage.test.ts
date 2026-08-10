import { afterEach, describe, expect, it } from "vitest";
import {
  clearStorageUsageCache,
  formatBytes,
  resolveStorageLimit,
} from "@/lib/admin/storage-usage";

describe("formatBytes", () => {
  it("formats common sizes in German locale", () => {
    expect(formatBytes(0)).toBe("0\u00a0B");
    expect(formatBytes(512)).toBe("512\u00a0B");
    expect(formatBytes(1024)).toMatch(/1\s*KB|1\u00a0KB/);
    expect(formatBytes(1.5 * 1024 * 1024)).toMatch(/1[,.]5\u00a0MB/);
  });
});

describe("resolveStorageLimit", () => {
  const prevBytes = process.env.STORAGE_LIMIT_BYTES;
  const prevGb = process.env.NEON_STORAGE_LIMIT_GB;

  afterEach(() => {
    if (prevBytes === undefined) delete process.env.STORAGE_LIMIT_BYTES;
    else process.env.STORAGE_LIMIT_BYTES = prevBytes;
    if (prevGb === undefined) delete process.env.NEON_STORAGE_LIMIT_GB;
    else process.env.NEON_STORAGE_LIMIT_GB = prevGb;
    clearStorageUsageCache();
  });

  it("defaults to Neon Free 0.5 GB", () => {
    delete process.env.STORAGE_LIMIT_BYTES;
    delete process.env.NEON_STORAGE_LIMIT_GB;
    const { limitBytes, limitSource } = resolveStorageLimit();
    expect(limitSource).toBe("default");
    expect(limitBytes).toBe(Math.round(0.5 * 1024 * 1024 * 1024));
  });

  it("prefers STORAGE_LIMIT_BYTES", () => {
    process.env.STORAGE_LIMIT_BYTES = "1073741824";
    process.env.NEON_STORAGE_LIMIT_GB = "2";
    const { limitBytes, limitSource } = resolveStorageLimit();
    expect(limitSource).toBe("STORAGE_LIMIT_BYTES");
    expect(limitBytes).toBe(1073741824);
  });

  it("uses NEON_STORAGE_LIMIT_GB when bytes unset", () => {
    delete process.env.STORAGE_LIMIT_BYTES;
    process.env.NEON_STORAGE_LIMIT_GB = "1";
    const { limitBytes, limitSource } = resolveStorageLimit();
    expect(limitSource).toBe("NEON_STORAGE_LIMIT_GB");
    expect(limitBytes).toBe(1024 * 1024 * 1024);
  });
});
