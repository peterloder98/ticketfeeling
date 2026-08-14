import { afterEach, describe, expect, it } from "vitest";
import { persistQrToken, readQrToken, hashToken } from "@/lib/crypto-token";
import { encryptSecret } from "@/lib/crypto-fields";

const KEY = "a".repeat(64);

describe("QR token persist/read", () => {
  afterEach(() => {
    delete process.env.FIELD_ENCRYPTION_KEY;
  });

  it("stores plaintext when no encryption key is set", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    const stored = persistQrToken("plain-token");
    expect(stored.token).toBe("plain-token");
    expect(stored.tokenHash).toBe(hashToken("plain-token"));
    expect(readQrToken(stored.token)).toBe("plain-token");
  });

  it("encrypts at rest when FIELD_ENCRYPTION_KEY is set", () => {
    process.env.FIELD_ENCRYPTION_KEY = KEY;
    const stored = persistQrToken("secret-qr");
    expect(stored.token.startsWith("v1:")).toBe(true);
    expect(stored.token).not.toContain("secret-qr");
    expect(stored.tokenHash).toBe(hashToken("secret-qr"));
    expect(readQrToken(stored.token)).toBe("secret-qr");
  });

  it("still reads legacy plaintext tokens after encryption is enabled", () => {
    process.env.FIELD_ENCRYPTION_KEY = KEY;
    expect(readQrToken("legacy-plain")).toBe("legacy-plain");
    const sealed = encryptSecret("roundtrip");
    expect(readQrToken(sealed)).toBe("roundtrip");
  });
});
