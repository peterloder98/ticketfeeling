/** Browser-side cart session backup for iframe embeds when cookies are flaky. */

export const CART_SESSION_STORAGE_KEY = "tf_cart_session";
export const CART_SESSION_HEADER = "x-cart-session";

export function readStoredCartSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(CART_SESSION_STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function storeCartSession(sessionKey: string | null | undefined) {
  if (typeof window === "undefined") return;
  if (!sessionKey?.trim()) return;
  try {
    window.sessionStorage.setItem(CART_SESSION_STORAGE_KEY, sessionKey.trim());
  } catch {
    /* private mode / blocked storage */
  }
}

export function clearStoredCartSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CART_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Fetch cart APIs with credentials + optional session backup header. */
export async function cartFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const stored = readStoredCartSession();
  if (stored && !headers.has(CART_SESSION_HEADER)) {
    headers.set(CART_SESSION_HEADER, stored);
  }
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  try {
    const clone = response.clone();
    const data = (await clone.json()) as { sessionKey?: string | null };
    if (typeof data?.sessionKey === "string" && data.sessionKey) {
      storeCartSession(data.sessionKey);
    }
  } catch {
    /* non-json or empty */
  }
  return response;
}
