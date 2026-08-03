/** Reject if `promise` does not settle within `ms`. Clears the timer on settle. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorCode = "TIMEOUT",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorCode)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Run work but never block longer than `ms` — on timeout returns `fallback`. */
export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  label?: string,
): Promise<T> {
  try {
    return await withTimeout(promise, ms, "TIMEOUT");
  } catch (error) {
    if (error instanceof Error && error.message === "TIMEOUT") {
      if (label) console.warn(`[timeout] ${label} exceeded ${ms}ms — continuing`);
      return fallback;
    }
    throw error;
  }
}
