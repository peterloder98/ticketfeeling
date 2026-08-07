import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "@/lib/security/password";

describe("password hashing", () => {
  it("hashes with Argon2id and verifies", async () => {
    const hash = await hashPassword("SecurePass!26");
    expect(hash.startsWith("$argon2")).toBe(true);
    expect(passwordNeedsRehash(hash)).toBe(false);
    expect(await verifyPassword("SecurePass!26", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("verifies legacy bcrypt hashes without forcing reset", async () => {
    const legacy = await bcrypt.hash("LegacyPass!26", 10);
    expect(passwordNeedsRehash(legacy)).toBe(true);
    expect(await verifyPassword("LegacyPass!26", legacy)).toBe(true);
    expect(await verifyPassword("wrong", legacy)).toBe(false);
  });
});
