import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { getStorageUsage } from "@/lib/admin/storage-usage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
  }
  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "audit:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:read"));
  if (!allowed) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const url = new URL(request.url);
  const bypassCache = url.searchParams.get("refresh") === "1";
  const snapshot = await getStorageUsage({ bypassCache });

  return NextResponse.json({
    data: snapshot,
  });
}
