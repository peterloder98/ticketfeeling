import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { SiteHeaderClient } from "@/components/site-header-client";

export async function SiteHeader() {
  const session = await getSession();
  let canAdmin = false;
  if (session?.user?.id) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership) {
      canAdmin = await userHasPermission(
        session.user.id,
        membership.organizationId,
        "events:read",
      );
    }
  }

  return (
    <SiteHeaderClient
      signedIn={Boolean(session?.user)}
      canAdmin={canAdmin}
    />
  );
}
