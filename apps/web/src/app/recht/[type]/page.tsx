import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { buildSellerIdentity, formatSellerAddress } from "@/lib/legal/seller";

export const dynamic = "force-dynamic";

const TYPE_MAP: Record<string, string> = {
  impressum: "impressum",
  datenschutz: "privacy",
  agb: "terms",
  veranstaltungsbedingungen: "event_terms",
  widerruf: "withdrawal",
  rueckerstattung: "refund",
};

type Props = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: Props) {
  const { type } = await params;
  return { title: type.charAt(0).toUpperCase() + type.slice(1) };
}

export default async function LegalPage({ params }: Props) {
  const { type } = await params;
  const docType = TYPE_MAP[type];
  if (!docType) notFound();

  const org = await getDefaultOrganization();
  if (!org) notFound();
  const seller = buildSellerIdentity(org, org.settings);

  if (docType === "impressum") {
    return (
      <div className="tf-container prose-invert max-w-3xl py-12">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--gold-soft)]">
          Impressum
        </h1>
        <div className="tf-card mt-6 space-y-2 text-[var(--muted)]">
          <p className="text-[var(--ink)] font-semibold">{seller.displayName}</p>
          <p>Peter Loder, handelnd unter Ticketfeeling</p>
          <p>{formatSellerAddress(seller)}</p>
          <p>E-Mail: {seller.email ?? "—"}</p>
          <p>Support: {seller.supportEmail ?? "—"}</p>
          <p>Telefon: {seller.phone ?? "—"}</p>
          <p>Website: {seller.homepage ?? "—"}</p>
          <p>Ticketshop: {seller.ticketShopDomain ?? "www.ticketfeeling.de"}</p>
          <p>Steuernummer: {seller.taxNumber ?? "wird ergänzt"}</p>
          <p>USt-IdNr.: {seller.vatId ?? "sofern vorhanden"}</p>
          <p>Finanzamt: {seller.taxOffice ?? "wird ergänzt"}</p>
          <p className="pt-4 text-xs">
            Veranstaltungsmarke: {seller.brandName}. Vertragspartner der Kunden ist Peter Loder.
            Dieses Impressum ist ein technischer Entwurf und vor Produktivstart final zu prüfen.
          </p>
        </div>
      </div>
    );
  }

  const version = await prisma.legalDocumentVersion.findFirst({
    where: {
      status: "published",
      legalDocument: { organizationId: org.id, type: docType },
    },
    orderBy: { publishedAt: "desc" },
  });

  if (!version) notFound();

  return (
    <div className="tf-container max-w-3xl py-12">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--gold)]">
        Version {version.version}
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--gold-soft)]">
        {version.title}
      </h1>
      <div className="tf-card mt-6 whitespace-pre-wrap text-[var(--muted)]">{version.content}</div>
      <p className="mt-4 text-xs text-[var(--muted)]">
        Entwurf — vor Produktivstart anwaltlich / fachlich freigeben. Verkäufer: {seller.displayName}.
      </p>
    </div>
  );
}
