import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import {
  LEGAL_DOCUMENT_TYPES,
  LEGAL_TYPE_META,
  type LegalDocumentType,
} from "@/lib/legal/document-types";
import { LegalEditor } from "@/components/admin/legal-editor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: Props) {
  const { type } = await params;
  const meta = LEGAL_TYPE_META[type as LegalDocumentType];
  return { title: meta ? `Recht · ${meta.label}` : "Rechtstext" };
}

export default async function AdminLegalTypePage({ params }: Props) {
  const { type: raw } = await params;
  if (!LEGAL_DOCUMENT_TYPES.includes(raw as LegalDocumentType)) notFound();
  const type = raw as LegalDocumentType;
  const meta = LEGAL_TYPE_META[type];

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead =
    (await userHasPermission(session.user.id, membership.organizationId, "legal:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:read"));
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const canWrite =
    (await userHasPermission(session.user.id, membership.organizationId, "legal:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));

  const doc = await prisma.legalDocument.findUnique({
    where: {
      organizationId_type: { organizationId: membership.organizationId, type },
    },
    include: {
      versions: { orderBy: [{ createdAt: "desc" }] },
    },
  });

  const versions = (doc?.versions ?? []).map((v) => ({
    id: v.id,
    version: v.version,
    title: v.title,
    content: v.content,
    changelog: v.changelog,
    status: v.status,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/einstellungen/recht"
          className="text-sm font-medium text-[var(--tf-teal)] underline"
        >
          ← Alle Rechtstexte
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          {meta.label}
        </h1>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">{meta.description}</p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />
      <LegalEditor
        type={type}
        label={meta.label}
        initialVersions={versions}
        canWrite={canWrite}
      />
    </div>
  );
}
