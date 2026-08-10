import { getSession } from "@/lib/auth/session";
import { SiteHeaderClient } from "@/components/site-header-client";

/**
 * Public layout header: only resolve JWT session here.
 * Membership/RBAC used to run on every soft-nav (Neon RTT × N) and made
 * every click feel multi-second for signed-in staff. Staff links load via
 * /api/v1/auth/nav after paint.
 */
export async function SiteHeader() {
  const session = await getSession();
  return <SiteHeaderClient signedIn={Boolean(session?.user)} />;
}
