import { createHash, randomBytes } from "crypto";
import { openSensitiveToken, sealSensitiveToken } from "@/lib/crypto-fields";

export function createSecureToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Persist QR: hash is always of plaintext; DB column may be encrypted. */
export function persistQrToken(plain: string): { tokenHash: string; token: string } {
  return { tokenHash: hashToken(plain), token: sealSensitiveToken(plain) };
}

export function readQrToken(stored: string | null | undefined): string | null {
  return openSensitiveToken(stored);
}
