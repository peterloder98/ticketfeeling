/**
 * Shared System-tool gates (Speicher, …).
 * Keep nav/hub cards unfiltered — these only gate page + actions.
 */

export const SYSTEM_STORAGE_PERMS = ["org:write", "audit:read", "org:read"] as const;

/** Staff who may open System → Speicher. */
export function canAccessSystemStorage(keys: Set<string>): boolean {
  return SYSTEM_STORAGE_PERMS.some((p) => keys.has(p));
}
