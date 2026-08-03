import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { SaalplanEditor } from "@/components/admin/saalplan-editor";
import { parseVenuePlanObjects } from "@/lib/saalplan/types";
import { parsePlanCategorySlots } from "@/lib/saalplan/category-slots";
import { saveVenuePlanAction } from "@/app/admin/saalplan/actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ planId: string }> };

export async function generateMetadata({ params }: Props) {
  const { planId } = await params;
  const plan = await prisma.venuePlan.findUnique({
    where: { id: planId },
    select: { name: true },
  });
  return { title: plan?.name ? `${plan.name} · Saalplan` : "Saalplan" };
}

export default async function VenuePlanEditorPage({ params }: Props) {
  const { planId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canWrite =
    (await userHasPermission(session.user.id, membership.organizationId, "locations:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!canWrite) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const plan = await prisma.venuePlan.findFirst({
    where: { id: planId, organizationId: membership.organizationId },
    include: { location: { select: { id: true, name: true } } },
  });
  if (!plan) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/admin/locations/${plan.locationId}`}
          className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
        >
          ← {plan.location.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--tf-navy)] md:text-3xl">
          Saalplan bearbeiten
        </h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          {plan.location.name} — Maße, Blöcke und Kategorien (Block/Reihe/Platz) hier setzen. Beim
          Event werden Ticketkategorien mit gleichem Namen verknüpft.
        </p>
      </div>

      <SaalplanEditor
        planId={plan.id}
        initialName={plan.name}
        initialWidthCm={plan.widthCm}
        initialDepthCm={plan.depthCm}
        initialObjects={parseVenuePlanObjects(plan.objects)}
        initialCategorySlots={parsePlanCategorySlots(plan.categorySlots)}
        saveAction={saveVenuePlanAction}
      />
    </div>
  );
}
