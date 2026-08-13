import { notFound } from "next/navigation";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { buildSellerIdentity, formatSellerAddress } from "@/lib/legal/seller";
import { PUBLIC_SLUG_TO_TYPE } from "@/lib/legal/document-types";
import {
  findPublishedLegalVersion,
  getSeedLegalVersion,
  syncLegalCatalog,
} from "@/lib/legal/sync-catalog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ type: string }> };

type VersionView = {
  version: string;
  title: string;
  content: string;
  publishedAt: Date | null;
};

function isPlaceholder(content: string) {
  return content.includes("ENTWURF —") || content.trim().length < 400;
}

export async function generateMetadata({ params }: Props) {
  try {
    const { type } = await params;
    const docType = PUBLIC_SLUG_TO_TYPE[type];
    if (!docType) return { title: "Rechtliches" };
    const seed = getSeedLegalVersion(docType);
    return { title: seed?.title ?? type };
  } catch {
    return { title: "Rechtliches" };
  }
}

function LegalDocumentView({
  version,
  sellerName,
}: {
  version: VersionView;
  sellerName: string;
}) {
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
        Verantwortlich: {sellerName}. Rechtstexte werden versioniert und beim Kauf
        revisionssicher mit der Bestellung verknüpft.
      </p>
    </div>
  );
}

export default async function LegalPage({ params }: Props) {
  const { type } = await params;
  const docType = PUBLIC_SLUG_TO_TYPE[type];
  if (!docType) notFound();

  const seed = getSeedLegalVersion(docType);
  if (!seed) notFound();

  let sellerName = "Peter Loder – Ticketfeeling";
  let version: VersionView = seed;

  try {
    const org = await getDefaultOrganization();
    if (org) {
      const seller = buildSellerIdentity(org, org.settings);
      sellerName = seller.displayName;

      // Publish catalog versions (e.g. address / AGB fixes) so prod matches seed.
      try {
        await syncLegalCatalog(org.id);
      } catch (error) {
        console.error("[legal] syncLegalCatalog on page load failed", error);
      }

      const fromDb = await findPublishedLegalVersion(org.id, docType);
      if (fromDb && !isPlaceholder(fromDb.content)) {
        version = fromDb;
      }

      // Impressum: prefer structured stammdaten only when neither DB nor seed is useful.
      if (docType === "impressum" && isPlaceholder(version.content)) {
        return (
          <div className="tf-container max-w-3xl py-12">
            <h1 className="text-4xl font-semibold tracking-tight text-[var(--tf-navy)]">
              Impressum
            </h1>
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
    }
  } catch (error) {
    console.error("[legal] page load failed, using seed fallback", error);
  }

  return <LegalDocumentView version={version} sellerName={sellerName} />;
}
