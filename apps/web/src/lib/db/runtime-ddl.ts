/**
 * Runtime ensure*Schema helpers must not ALTER TABLE — or probe
 * information_schema — on production/Vercel request paths. Migrations run at
 * build via migrate-deploy.cjs. Local/dev may still patch when migrate lags.
 *
 * Callers should treat a true result as “schema is ready” (no RTT).
 */
export function shouldSkipRuntimeDdl(): boolean {
  if (process.env.ALLOW_RUNTIME_DDL === "1") return false;
  return (
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}
