import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { SaalplanEditor } from "@/components/admin/saalplan-editor";
import { SaalplanReturnButton } from "@/components/admin/saalplan-return-button";
import { parseVenuePlanObjects } from "@/lib/saalplan/types";
import { parsePlanCategorySlots } from "@/lib/saalplan/category-slots";
import { saveVenuePlanAction } from "@/app/admin/saalplan/actions";
import {
  checkVenuePlanGeometryFrozen,
  GEOMETRY_FROZEN_MESSAGE,
} from "@/lib/seating/geometry-freeze";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ returnTo?: string; returnLabel?: string; popup?: string }>;
};

function safeReturnTo(raw: string | undefined): string | null {
  if (!raw) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  // Only allow relative admin paths — no open redirects.
  if (!decoded.startsWith("/admin/")) return null;
  if (decoded.startsWith("//")) return null;
  return decoded;
}

export async function generateMetadata({ params }: Props) {
  const { planId } = await params;
  const plan = await prisma.venuePlan.findUnique({
    where: { id: planId },
    select: { name: true },
  });
  return { title: plan?.name ? `${plan.name} · Saalplan` : "Saalplan" };
}

export default async function VenuePlanEditorPage({ params, searchParams }: Props) {
  const { planId } = await params;
  const sp = await searchParams;
  const returnTo = safeReturnTo(sp.returnTo);
  const returnLabel = sp.returnLabel?.trim() || null;
  const isPopup = sp.popup === "1";

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

  const freeze = await checkVenuePlanGeometryFrozen(plan.id);
  const geometryFrozen = freeze.frozen;

  const fallbackHref = `/admin/locations/${plan.locationId}`;
  const backHref = returnTo ?? fallbackHref;
  const backLabel =
    returnLabel ||
    (returnTo?.includes("/events/neu")
      ? "Zurück zum Wizard"
      : returnTo?.includes("/events/")
        ? "Zurück zum Event"
        : `← ${plan.location.name}`);

  const displayBackLabel =
    backLabel.startsWith("←") || backLabel.startsWith("Zurück") ? backLabel : `← ${backLabel}`;

  const primaryReturnLabel =
    returnLabel ||
    (returnTo?.includes("/events/neu")
      ? "Zurück zum Wizard"
      : returnTo
        ? "Zurück zum Event"
        : null);

  return (
    <div
      className={
        isPopup
          ? "space-y-4"
          : "-mx-4 space-y-4 px-2 sm:-mx-6 sm:px-4 lg:-mx-8 lg:px-6"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {returnTo ? (
            <SaalplanReturnButton
              href={backHref}
              label={displayBackLabel}
              planId={plan.id}
              className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
            />
          ) : (
            <Link
              href={backHref}
              className="text-sm text-[var(--tf-text-secondary)] hover:text-[var(--tf-navy)]"
            >
              {displayBackLabel}
            </Link>
          )}
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--tf-navy)] md:text-3xl">
            Saalplan zeichnen
          </h1>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            {plan.location.name} — nur Geometrie: Maße, Bühne und Blöcke. Preiskategorien kommen am
            Event.
          </p>
        </div>
        {returnTo && primaryReturnLabel ? (
          <SaalplanReturnButton
            href={returnTo}
            label={primaryReturnLabel}
            planId={plan.id}
            className="tf-btn tf-btn-secondary !min-h-10 shrink-0 text-sm"
          />
        ) : null}
      </div>

      <SaalplanEditor
        planId={plan.id}
        initialName={plan.name}
        initialWidthCm={plan.widthCm}
        initialDepthCm={plan.depthCm}
        initialObjects={parseVenuePlanObjects(plan.objects)}
        initialCategorySlots={parsePlanCategorySlots(plan.categorySlots)}
        saveAction={saveVenuePlanAction}
        geometryFrozen={geometryFrozen}
        geometryFrozenMessage={geometryFrozen ? GEOMETRY_FROZEN_MESSAGE : null}
        returnTo={returnTo}
        returnLabel={primaryReturnLabel}
      />
    </div>
  );
}
