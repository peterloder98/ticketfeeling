import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationForUser, getUserPermissionKeys } from "@/lib/rbac";

export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

/** Staff nav flags for the public header — kept off the layout critical path. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({
      signedIn: false,
      canAdmin: false,
      canKasse: false,
      boxOfficeOnly: false,
    });
  }

  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return NextResponse.json({
      signedIn: true,
      canAdmin: false,
      canKasse: false,
      boxOfficeOnly: false,
    });
  }

  const keys = await getUserPermissionKeys(session.user.id, membership.organizationId);
  const canSell = keys.has("box_office:sell");
  const elevated =
    keys.has("events:write") || keys.has("org:write") || keys.has("users:write");
  const canAdmin =
    !canSell || elevated
      ? keys.has("events:write") || keys.has("org:write") || keys.has("events:read")
      : false;
  // Vorverkaufsstelle: sell yes, elevated no → hide Admin, show Tageskasse.
  const boxOfficeOnly = canSell && !elevated;
  const canKasse = canSell;

  return NextResponse.json({
    signedIn: true,
    canAdmin: Boolean(canAdmin && !boxOfficeOnly),
    canKasse,
    boxOfficeOnly,
  });
}
