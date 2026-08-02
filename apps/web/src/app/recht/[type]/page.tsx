import { notFound } from "next/navigation";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { buildSellerIdentity, formatSellerAddress } from "@/lib/legal/seller";
import { PUBLIC_SLUG_TO_TYPE } from "@/lib/legal/document-types";
import { findPublishedLegalVersion, syncLegalCatalog } from "@/lib/legal/sync-catalog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: Props) {
  try {
    const { type } = await params;
    const docType = PUBLIC_SLUG_TO_TYPE[type];
    if (!docType) return { title: "Rechtliches" };
    const org = await getDefaultOrganization();
    if (!org) return { title: "Rechtliches" };
    const version = await findPublishedLegalVersion(org.id, docType);
    return { title: version?.title ?? type };
  } catch {
    return { title: "Rechtliches" };
  }
}

export default async function LegalPage({ params }: Props) {
  const { type } = await params;
  const docType = PUBLIC_SLUG_TO_TYPE[type];
  if (!docType) notFound();

  const org = await getDefaultOrganization();
  if (!org) notFound();
  const seller = buildSellerIdentity(org, org.settings);

  let version = await findPublishedLegalVersion(org.id, docType);

  // Bootstrap catalog once if production DB still has empty/placeholder docs.
  if (!version || version.content.includes("ENTWURF —")) {
    try {
      await syncLegalCatalog(org.id);
    } catch (error) {
      console.error("[legal] syncLegalCatalog failed", error);
    }
    version = await findPublishedLegalVersion(org.id, docType);
  }

  // Impressum: DB text preferred; fall back to stammdaten if missing.
  if (docType === "impressum" && !version) {
    return (
      <div className="tf-container max-w-3xl py-12">
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--tf-navy)]">Impressum</h1>
        <div className="tf-card mt-6 space-y-2 text-[var(--tf-text-secondary)]">
          <p className="font-semibold text-[var(--tf-navy)]">{seller.displayName}</p>
          <p>Peter Loder, handelnd unter Ticketfeeling</p>
          <p>{formatSellerAddress(seller)}</p>
          <p>E-Mail: {seller.email ?? "support@ticketfeeling.de"}</p>
          <p>Telefon: {seller.phone ?? "01512 / 5744383"}</p>
        </div>
      </div>
    );
  }

  if (!version) notFound();

  return (
    <div className="tf-container max-w-3xl py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
        Version {version.version}
        {version.publishedAt
          ? ` · ${new Date(version.publishedAt).toLocaleDateString("de-DE", {
              timeZone: "Europe/Berlin",
            })}`
          : ""}
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[var(--tf-navy)]">
        {version.title}
      </h1>
      <div className="tf-card mt-6 whitespace-pre-wrap text-sm leading-relaxed text-[var(--tf-text-secondary)]">
        {version.content}
      </div>
      <p className="mt-4 text-xs text-[var(--tf-text-secondary)]">
        Verantwortlich: {seller.displayName}. Rechtstexte werden versioniert und beim Kauf
        revisionssicher mit der Bestellung verknüpft.
      </p>
    </div>
  );
}
