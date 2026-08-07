import argon2 from "argon2";
import bcrypt from "bcryptjs";

/**
 * Password hashing: Argon2id for new hashes; verify accepts legacy bcrypt
 * so existing users keep logging in without a forced reset.
 */

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (!passwordHash) return false;

  if (passwordHash.startsWith("$argon2")) {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  // Legacy bcrypt ($2a$ / $2b$ / $2y$)
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}

/** True when the stored hash should be re-hashed with Argon2id on next successful login. */
export function passwordNeedsRehash(passwordHash: string): boolean {
  return !passwordHash.startsWith("$argon2");
}
