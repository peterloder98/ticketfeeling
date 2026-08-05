import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { isBoxOfficeOnlyUser } from "@/lib/commerce/box-office-access";

/** Post-login landing path based on role (Vorverkaufsstelle → /kasse). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ path: "/login" }, { status: 401 });
  }

  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return NextResponse.json({ path: "/" });
  }

  const orgId = membership.organizationId;
  if (await isBoxOfficeOnlyUser(session.user.id, orgId)) {
    return NextResponse.json({ path: "/kasse" });
  }

  const canAdmin =
    (await userHasPermission(session.user.id, orgId, "events:read")) ||
    (await userHasPermission(session.user.id, orgId, "org:read")) ||
    (await userHasPermission(session.user.id, orgId, "events:write"));

  if (canAdmin) {
    return NextResponse.json({ path: "/admin" });
  }

  if (await userHasPermission(session.user.id, orgId, "box_office:sell")) {
    return NextResponse.json({ path: "/kasse" });
  }

  return NextResponse.json({ path: "/konto" });
}
