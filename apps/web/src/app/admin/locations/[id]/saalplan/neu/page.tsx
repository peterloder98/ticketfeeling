import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { createVenuePlanAction } from "@/app/admin/saalplan/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Neuer Saalplan" };

type Props = { params: Promise<{ id: string }> };

export default async function NewVenuePlanPage({ params }: Props) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canWrite =
    (await userHasPermission(session.user.id, membership.organizationId, "locations:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write"));
  if (!canWrite) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const location = await prisma.location.findFirst({
    where: { id, organizationId: membership.organizationId },
    select: { id: true, name: true },
  });
  if (!location) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href={`/admin/locations/${location.id}`}
          className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
        >
          ← {location.name}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Neuen Saalplan erstellen
        </h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Schritt 1 von 2: Saalgröße festlegen. Danach öffnet sich der Editor für Bühne und Sitze.
        </p>
      </div>

      <ol className="grid gap-2 rounded-2xl border border-[var(--tf-line)] bg-white p-4 text-sm">
        <li className="font-medium text-[var(--tf-navy)]">1. Hier: Name + Breite × Tiefe in Metern</li>
        <li className="text-[var(--tf-text-secondary)]">
          2. Im Editor: Bühne ziehen, Sitzblöcke mit Reihen × Sitze, speichern
        </li>
        <li className="text-[var(--tf-text-secondary)]">
          3. Beim Event: diesen Plan unter „Saalplan“ auswählen
        </li>
      </ol>

      <form
        action={createVenuePlanAction}
        className="space-y-4 rounded-2xl border border-[var(--tf-line)] bg-white p-5"
      >
        <input type="hidden" name="locationId" value={location.id} />
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-[var(--tf-navy)]">Name</span>
          <input
            name="name"
            className="tf-input"
            required
            defaultValue={`Saalplan ${location.name}`}
            placeholder="z. B. Haupthalle, Variante A"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Breite (m)</span>
            <input
              name="widthM"
              type="number"
              min={2}
              step={0.1}
              required
              className="tf-input"
              defaultValue="20"
            />
            <span className="text-xs text-[var(--tf-text-secondary)]">von links nach rechts</span>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Tiefe (m)</span>
            <input
              name="depthM"
              type="number"
              min={2}
              step={0.1}
              required
              className="tf-input"
              defaultValue="15"
            />
            <span className="text-xs text-[var(--tf-text-secondary)]">von Bühne zur Rückwand</span>
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="withStage" className="mt-1" defaultChecked />
          <span>
            Bühne sofort anlegen
            <span className="mt-0.5 block text-xs text-[var(--tf-text-secondary)]">
              Empfohlen — du kannst sie danach verschieben und in der Größe ändern.
            </span>
          </span>
        </label>
        <button type="submit" className="tf-btn tf-btn-primary w-full !min-h-12">
          Weiter zum Editor
        </button>
      </form>
    </div>
  );
}
