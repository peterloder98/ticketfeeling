import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { createEventAction } from "@/app/admin/events/actions";
import { CreateEventWizard } from "@/components/admin/create-event-wizard";
import { cmToMetersLabel, parseVenuePlanObjects, planSeatCapacity } from "@/lib/saalplan/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Neues Event" };

type Props = { searchParams: Promise<{ tourId?: string }> };

export default async function NewEventPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canWrite =
    (await userHasPermission(
      session.user.id,
      membership.organizationId,
      "events:write",
    )) ||
    (await userHasPermission(
      session.user.id,
      membership.organizationId,
      "tours:write",
    ));
  if (!canWrite) {
    return (
      <p className="text-[var(--danger)]">
        Keine Berechtigung (events:write oder tours:write).
      </p>
    );
  }

  const { tourId: tourIdParam } = await searchParams;

  const [locationsRaw, tours, artists] = await Promise.all([
    prisma.location.findMany({
      where: { organizationId: membership.organizationId },
      select: {
        id: true,
        name: true,
        city: true,
        venuePlans: {
          select: {
            id: true,
            name: true,
            widthCm: true,
            depthCm: true,
            objects: true,
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.tour.findMany({
      where: { organizationId: membership.organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        coverImageUrl: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.artist.findMany({
      where: { organizationId: membership.organizationId },
      select: {
        id: true,
        name: true,
        homepage: true,
        youtube: true,
        shortBio: true,
        profileImageUrl: true,
        headerImageUrl: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const locations = locationsRaw.map((loc) => ({
    id: loc.id,
    name: loc.name,
    city: loc.city,
    venuePlans: loc.venuePlans.map((p) => ({
      id: p.id,
      name: p.name,
      seatCapacity: planSeatCapacity(parseVenuePlanObjects(p.objects)),
      sizeLabel: `${cmToMetersLabel(p.widthCm)} × ${cmToMetersLabel(p.depthCm)}`,
    })),
  }));

  const initialTourId =
    tourIdParam && tours.some((t) => t.id === tourIdParam) ? tourIdParam : "";
  const fromTour = Boolean(initialTourId);

  return (
    <div className="w-full max-w-none">
      <Link
        href={fromTour ? `/admin/tours/${initialTourId}` : "/admin/events"}
        className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
      >
        {fromTour ? "← Zurück zur Tour" : "← Zurück zur Event-Liste"}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
        {fromTour ? "Neuen Termin anlegen" : "Neues Event"}
      </h1>

      <CreateEventWizard
        organizationId={membership.organizationId}
        locations={locations}
        tours={tours}
        artists={artists}
        initialTourId={initialTourId || undefined}
        action={createEventAction}
      />
    </div>
  );
}
