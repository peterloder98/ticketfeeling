import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { isBoxOfficeOnlyUser } from "@/lib/commerce/box-office-access";
import { SiteHeaderClient } from "@/components/site-header-client";

export async function SiteHeader() {
  const session = await getSession();
  let canAdmin = false;
  let canKasse = false;
  let boxOfficeOnly = false;
  if (session?.user?.id) {
    const membership = await getDefaultOrganizationForUser(session.user.id);
    if (membership) {
      const orgId = membership.organizationId;
      boxOfficeOnly = await isBoxOfficeOnlyUser(session.user.id, orgId);
      canKasse = await userHasPermission(session.user.id, orgId, "box_office:sell");
      canAdmin =
        !boxOfficeOnly &&
        ((await userHasPermission(session.user.id, orgId, "events:write")) ||
          (await userHasPermission(session.user.id, orgId, "org:write")) ||
          (await userHasPermission(session.user.id, orgId, "events:read")));
    }
  }

  return (
    <SiteHeaderClient
      signedIn={Boolean(session?.user)}
      canAdmin={canAdmin}
      canKasse={canKasse}
      boxOfficeOnly={boxOfficeOnly}
    />
  );
}
