import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { patchBoxOfficeSellerGrants } from "@/lib/commerce/box-office-grants";
import { formatEventOptionLabel } from "@/lib/admin/event-option-label";
import { formatDeDateTime } from "@/lib/datetime-de";

const patchSchema = z.object({
  userId: z.string().uuid(),
  addEventIds: z.array(z.string().uuid()).optional(),
  removeEventIds: z.array(z.string().uuid()).optional(),
});

async function requirePartnerAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  }
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) {
    return { error: NextResponse.json({ error: { code: "NO_ORG" } }, { status: 403 }) };
  }
  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "users:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!allowed) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  }
  return { session, membership };
}

/** PATCH — add/remove event grants for an existing Vorverkaufsstelle. */
export async function PATCH(request: Request) {
  const auth = await requirePartnerAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { session, membership } = auth as {
    session: { user: { id: string } };
    membership: { organizationId: string };
  };

  try {
    const body = patchSchema.parse(await request.json());
    const result = await patchBoxOfficeSellerGrants({
      organizationId: membership.organizationId,
      actorUserId: session.user.id,
      userId: body.userId,
      addEventIds: body.addEventIds,
      removeEventIds: body.removeEventIds,
    });

    return NextResponse.json({
      ok: true,
      added: result.added,
      removed: result.removed,
      grants: result.grants.map((g) => {
        const whenLabel = g.event.eventStartsAt
          ? formatDeDateTime(g.event.eventStartsAt, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : null;
        return {
          id: g.id,
          eventId: g.eventId,
          createdAt: g.createdAt,
          event: {
            id: g.event.id,
            name: g.event.name,
            optionLabel: formatEventOptionLabel({
              name: g.event.name,
              whenLabel,
              locationCity: g.event.location?.city,
              locationName: g.event.location?.name,
            }),
          },
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "PARTNER_NOT_FOUND" || message === "NOT_BOX_OFFICE_PARTNER" ? 404 : 400;
    return NextResponse.json({ error: { code: message } }, { status });
  }
}
