import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";

type BoxOfficeAuthOk = {
  ok: true;
  userId: string;
  organizationId: string;
};

type BoxOfficeAuthErr = {
  ok: false;
  error: { code: "UNAUTHORIZED" | "NO_ORG" | "FORBIDDEN"; status: 401 | 403 };
};

export async function requireBoxOfficeSeller(): Promise<BoxOfficeAuthOk | BoxOfficeAuthErr> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false, error: { code: "UNAUTHORIZED", status: 401 } };
  }

  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return { ok: false, error: { code: "NO_ORG", status: 403 } };
  }

  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write"));
  if (!allowed) {
    return { ok: false, error: { code: "FORBIDDEN", status: 403 } };
  }

  return {
    ok: true,
    userId: session.user.id,
    organizationId: membership.organizationId,
  };
}
