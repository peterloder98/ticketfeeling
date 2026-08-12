/**
 * Shared System-tool gates (Speicher, Aufräumen, …).
 * Keep nav/hub cards unfiltered — these only gate page + actions.
 */

export const SYSTEM_STORAGE_PERMS = ["org:write", "audit:read", "org:read"] as const;

/** Same staff who may open Speicher may open Aufräumen (action still org-slug gated). */
export function canAccessSystemStorage(keys: Set<string>): boolean {
  return SYSTEM_STORAGE_PERMS.some((p) => keys.has(p));
}
