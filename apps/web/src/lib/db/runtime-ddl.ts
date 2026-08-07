/**
 * Runtime ensure*Schema helpers must not ALTER TABLE on production/Vercel
 * request paths — migrations run at build via migrate-deploy.cjs.
 * Local/dev may still patch schema when migrate lags.
 */
export function shouldSkipRuntimeDdl(): boolean {
  if (process.env.ALLOW_RUNTIME_DDL === "1") return false;
  return (
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}
