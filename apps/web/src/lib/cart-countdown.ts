export const CART_HOLD_MS = 10 * 60 * 1000;
export const CART_REMIND_AT_MS = {
  fiveMinutes: 5 * 60 * 1000,
  twoMinutes: 2 * 60 * 1000,
} as const;

export type CartCountdownState = {
  remainingMs: number;
  expired: boolean;
  totalMs: number;
  /** 0–1 progress of elapsed hold time */
  elapsedRatio: number;
  label: string;
  urgent: boolean;
  critical: boolean;
};

export function parseExpiresAt(expiresAt: string | Date | null | undefined): number | null {
  if (!expiresAt) return null;
  const ms = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Countdown is driven solely from server `expiresAt` (remaining = end − now).
 * Progress bar uses the standard hold window as denominator for a stable UI.
 */
export function getCartCountdownState(
  expiresAt: string | Date | null | undefined,
  nowMs = Date.now(),
): CartCountdownState | null {
  const end = parseExpiresAt(expiresAt);
  if (end == null) return null;

  const remainingMs = end - nowMs;
  const expired = remainingMs <= 0;
  const label = expired ? "00:00" : formatCountdown(remainingMs);
  const clampedRemaining = Math.max(0, remainingMs);
  // Cap remaining for progress if hold was extended beyond the default window.
  const progressRemaining = Math.min(clampedRemaining, CART_HOLD_MS);
  const elapsedRatio = Math.min(1, Math.max(0, 1 - progressRemaining / CART_HOLD_MS));

  return {
    remainingMs: clampedRemaining,
    expired,
    totalMs: CART_HOLD_MS,
    elapsedRatio,
    label,
    urgent: !expired && remainingMs <= CART_REMIND_AT_MS.fiveMinutes,
    critical: !expired && remainingMs <= CART_REMIND_AT_MS.twoMinutes,
  };
}
