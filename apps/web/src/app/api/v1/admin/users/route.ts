import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDefaultOrganizationForUser } from "@/lib/rbac";
import {
  canManageStaffUsers,
  ensureStaffManageableRoles,
  staffRoleLabel,
} from "@/lib/admin/staff-access";
import { createStaffInvite, listOpenStaffInvites } from "@/lib/admin/staff-invite";
import { createStaffUser, listStaffMemberships } from "@/lib/admin/staff-users";
import { prisma } from "@/lib/db";

async function requireUsersWrite(opts?: { syncRoles?: boolean }) {
  const session = await getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 }) };
  }
  // Mutations may need role sync; list GET skips the heavy path (ensure is TTL-cached anyway).
  if (opts?.syncRoles) {
    await ensureStaffManageableRoles(membership.organizationId);
  }
  const allowed = await canManageStaffUsers(session.user.id, membership.organizationId);
  if (!allowed) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  return { session, membership };
}

export async function GET() {
  const auth = await requireUsersWrite({ syncRoles: false });
  if ("error" in auth && auth.error) return auth.error;

  const { membership } = auth as Awaited<ReturnType<typeof requireUsersWrite>> & {
    membership: NonNullable<Awaited<ReturnType<typeof getDefaultOrganizationForUser>>>;
  };

  const [members, invites, customerCount] = await Promise.all([
    listStaffMemberships(membership.organizationId),
    listOpenStaffInvites(membership.organizationId),
    prisma.customer.count({ where: { organizationId: membership.organizationId } }),
  ]);

  return NextResponse.json({
    members: members.map((m) => ({
      membershipId: m.id,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      user: m.user,
      roles: m.roles.map((r) => ({
        key: r.role.key,
        name: staffRoleLabel(r.role.key),
      })),
    })),
    invites: invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      firstName: inv.firstName,
      lastName: inv.lastName,
      roleKey: inv.roleKey,
      roleName: staffRoleLabel(inv.roleKey),
      status: inv.status,
      invitedAt: inv.invitedAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
      acceptPath: `/einladung/${inv.token}`,
    })),
    customerCount,
  });
}

const createSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("invite"),
    email: z.string().email(),
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    roleKey: z.enum(["organizer_admin", "scanner"]),
  }),
  z.object({
    mode: z.literal("create"),
    email: z.string().email(),
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    roleKey: z.enum(["organizer_admin", "scanner"]),
    password: z.string().min(8).max(200),
  }),
]);

export async function POST(request: Request) {
  const auth = await requireUsersWrite({ syncRoles: true });
  if ("error" in auth && auth.error) return auth.error;

  const { session, membership } = auth as Awaited<ReturnType<typeof requireUsersWrite>> & {
    session: { user: { id: string } };
    membership: NonNullable<Awaited<ReturnType<typeof getDefaultOrganizationForUser>>>;
  };

  try {
    const body = createSchema.parse(await request.json());

    if (body.mode === "invite") {
      const invite = await createStaffInvite({
        organizationId: membership.organizationId,
        invitedByUserId: session.user.id,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        roleKey: body.roleKey,
      });
      return NextResponse.json({
        ok: true,
        invite: {
          id: invite.id,
          email: invite.email,
          roleKey: invite.roleKey,
          status: invite.status,
          expiresAt: invite.expiresAt,
          acceptPath: `/einladung/${invite.token}`,
        },
      });
    }

    const created = await createStaffUser({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      roleKey: body.roleKey,
      password: body.password,
    });

    return NextResponse.json({
      ok: true,
      user: { id: created.user.id, email: created.user.email },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: { code: message } }, { status: 400 });
  }
}
