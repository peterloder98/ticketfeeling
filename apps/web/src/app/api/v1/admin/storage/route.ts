import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationForUser, getUserPermissionKeys } from "@/lib/rbac";
import { getStorageUsage } from "@/lib/admin/storage-usage";
import { canAccessSystemStorage } from "@/lib/admin/system-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 });
  }
  const keys = await getUserPermissionKeys(session.user.id, membership.organizationId);
  if (!canAccessSystemStorage(keys)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const url = new URL(request.url);
  const bypassCache = url.searchParams.get("refresh") === "1";
  const snapshot = await getStorageUsage({ bypassCache });

  return NextResponse.json({
    data: snapshot,
  });
}
