/**
 * Authorize Vercel cron / manual cron callers.
 * Accept CRON_SECRET only via `Authorization: Bearer …` — never query string (#21).
 */
export function authorizeCron(request: Request): "ok" | "missing" | "unauthorized" {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return "missing";
  const auth = request.headers.get("authorization")?.trim();
  if (auth === `Bearer ${secret}`) return "ok";
  return "unauthorized";
}

export function cronUnauthorizedResponse(auth: "missing" | "unauthorized") {
  if (auth === "missing") {
    return {
      body: {
        error: "CRON_SECRET_NOT_CONFIGURED",
        hint: "In Vercel Environment Variables CRON_SECRET setzen und Production neu deployen.",
      },
      status: 503 as const,
    };
  }
  return { body: { error: "UNAUTHORIZED" }, status: 401 as const };
}
