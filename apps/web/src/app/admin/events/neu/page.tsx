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

export default async function NewEventPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canWrite = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "events:write",
  );
  if (!canWrite) return <p className="text-[var(--danger)]">Keine Berechtigung (events:write).</p>;

  const [locationsRaw, templates] = await Promise.all([
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
    typeof prisma.ticketCategoryTemplate?.findMany === "function"
      ? prisma.ticketCategoryTemplate.findMany({
          where: { organizationId: membership.organizationId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            priceGrossCents: true,
            capacity: true,
            maxPerOrder: true,
          },
        })
      : Promise.resolve([]),
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

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/events"
        className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
      >
        ← Zurück zur Event-Liste
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
        Neues Event
      </h1>
      <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
        In vier Schritten: Inhalte, Ort (optional Saalplan), Tickets — und fertig.
      </p>

      <CreateEventWizard
        locations={locations}
        templates={templates}
        action={createEventAction}
      />
    </div>
  );
}
