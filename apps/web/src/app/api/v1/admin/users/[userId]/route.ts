import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationForUser } from "@/lib/rbac";
import { canManageStaffUsers } from "@/lib/admin/staff-access";
import {
  resetStaffPassword,
  setMembershipRoles,
  setMembershipStatus,
} from "@/lib/admin/staff-users";

async function requireUsersWrite() {
  const session = await getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 }) };
  }
  // Role sync lives in setMembershipRoles / create paths — avoid ~60 upserts per PATCH.
  const allowed = await canManageStaffUsers(session.user.id, membership.organizationId);
  if (!allowed) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  return { session, membership };
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_roles"),
    roleKeys: z.array(z.enum(["organizer_admin", "box_office", "scanner"])).min(1),
  }),
  z.object({
    action: z.literal("set_status"),
    status: z.enum(["active", "disabled"]),
  }),
  z.object({
    action: z.literal("reset_password"),
    password: z.string().min(8).max(200),
  }),
]);

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUsersWrite();
  if ("error" in auth && auth.error) return auth.error;

  const { session, membership } = auth as Awaited<ReturnType<typeof requireUsersWrite>> & {
    session: { user: { id: string } };
    membership: NonNullable<Awaited<ReturnType<typeof getDefaultOrganizationForUser>>>;
  };

  const { userId } = await params;

  try {
    const body = patchSchema.parse(await request.json());

    if (body.action === "set_roles") {
      await setMembershipRoles({
        organizationId: membership.organizationId,
        actorUserId: session.user.id,
        userId,
        roleKeys: body.roleKeys,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_status") {
      await setMembershipStatus({
        organizationId: membership.organizationId,
        actorUserId: session.user.id,
        userId,
        status: body.status,
      });
      return NextResponse.json({ ok: true });
    }

    await resetStaffPassword({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      userId,
      password: body.password,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
