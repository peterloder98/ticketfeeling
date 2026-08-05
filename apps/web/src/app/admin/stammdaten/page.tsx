import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import Link from "next/link";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import {
  companyAddressToJson,
  formatCompanyAddressLine,
  resolveBillingCompanyAddress,
  resolvePublicCompanyAddress,
  type CompanyAddress,
} from "@/lib/legal/company-address";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const TSE_MODES = ["none", "planned", "fiskaly", "external"] as const;

function readAddressFromForm(formData: FormData, prefix: string): CompanyAddress {
  return {
    street: String(formData.get(`${prefix}Street`) ?? "").trim(),
    houseNumber: String(formData.get(`${prefix}HouseNumber`) ?? "").trim(),
    postalCode: String(formData.get(`${prefix}PostalCode`) ?? "").trim(),
    city: String(formData.get(`${prefix}City`) ?? "").trim(),
    country: String(formData.get(`${prefix}Country`) ?? "DE").trim() || "DE",
  };
}

async function requireOrgWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "org:write",
  );
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

async function updateCompanyAddresses(formData: FormData) {
  "use server";
  const { session, membership } = await requireOrgWrite();

  const publicAddress = readAddressFromForm(formData, "public");
  const billingAddress = readAddressFromForm(formData, "billing");
  if (!publicAddress.street || !publicAddress.city || !publicAddress.postalCode) {
    throw new Error("PUBLIC_ADDRESS_REQUIRED");
  }
  if (!billingAddress.street || !billingAddress.city || !billingAddress.postalCode) {
    throw new Error("BILLING_ADDRESS_REQUIRED");
  }

  const before = await prisma.organizationSettings.findUnique({
    where: { organizationId: membership.organizationId },
  });
  const prevData =
    before?.data && typeof before.data === "object" && !Array.isArray(before.data)
      ? (before.data as Record<string, unknown>)
      : {};

  await prisma.organizationSettings.update({
    where: { organizationId: membership.organizationId },
    data: {
      street: publicAddress.street,
      houseNumber: publicAddress.houseNumber,
      postalCode: publicAddress.postalCode,
      city: publicAddress.city,
      country: publicAddress.country,
      publicCompanyAddress: companyAddressToJson(publicAddress),
      billingCompanyAddress: companyAddressToJson(billingAddress),
      data: {
        ...prevData,
        publicCompanyAddress: companyAddressToJson(publicAddress),
        billingCompanyAddress: companyAddressToJson(billingAddress),
      } as Prisma.InputJsonValue,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.addresses.updated",
    entityType: "organization_settings",
    entityId: membership.organizationId,
    before: before
      ? {
          public: resolvePublicCompanyAddress(before),
          billing: resolveBillingCompanyAddress(before),
        }
      : null,
    after: { public: publicAddress, billing: billingAddress },
  });

  revalidatePath("/admin/stammdaten");
  revalidatePath("/recht/impressum");
}

async function updateTrackingDefaults(formData: FormData) {
  "use server";
  const { session, membership } = await requireOrgWrite();

  const trackingEnabled = formData.get("trackingEnabled") === "on";
  const trackingGa4MeasurementId =
    String(formData.get("trackingGa4MeasurementId") ?? "").trim() || null;
  const trackingGtmContainerId =
    String(formData.get("trackingGtmContainerId") ?? "").trim() || null;
  const trackingMetaPixelId =
    String(formData.get("trackingMetaPixelId") ?? "").trim() || null;
  const trackingGoogleAdsId =
    String(formData.get("trackingGoogleAdsId") ?? "").trim() || null;

  const before = await prisma.organizationSettings.findUnique({
    where: { organizationId: membership.organizationId },
  });

  await prisma.organizationSettings.update({
    where: { organizationId: membership.organizationId },
    data: {
      trackingEnabled,
      trackingGa4MeasurementId,
      trackingGtmContainerId,
      trackingMetaPixelId,
      trackingGoogleAdsId,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.tracking.updated",
    entityType: "organization_settings",
    entityId: membership.organizationId,
    before: before
      ? {
          enabled: before.trackingEnabled,
          ga4: before.trackingGa4MeasurementId,
          gtm: before.trackingGtmContainerId,
          meta: before.trackingMetaPixelId,
          ads: before.trackingGoogleAdsId,
        }
      : null,
    after: {
      enabled: trackingEnabled,
      ga4: trackingGa4MeasurementId,
      gtm: trackingGtmContainerId,
      meta: trackingMetaPixelId,
      ads: trackingGoogleAdsId,
    },
  });

  revalidatePath("/admin/stammdaten");
}

async function updateTse(formData: FormData) {
  "use server";
  const { session, membership } = await requireOrgWrite();

  const tseMode = String(formData.get("tseMode") ?? "none");
  if (!TSE_MODES.includes(tseMode as (typeof TSE_MODES)[number])) {
    throw new Error("INVALID_TSE_MODE");
  }
  const tseClientId = String(formData.get("tseClientId") ?? "").trim() || null;
  const tseTssId = String(formData.get("tseTssId") ?? "").trim() || null;

  const before = await prisma.organizationSettings.findUnique({
    where: { organizationId: membership.organizationId },
  });

  await prisma.organizationSettings.update({
    where: { organizationId: membership.organizationId },
    data: { tseMode, tseClientId, tseTssId },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.tse.updated",
    entityType: "organization_settings",
    entityId: membership.organizationId,
    before: before
      ? { mode: before.tseMode, clientId: before.tseClientId, tssId: before.tseTssId }
      : null,
    after: { mode: tseMode, clientId: tseClientId, tssId: tseTssId },
  });

  revalidatePath("/admin/stammdaten");
  revalidatePath("/kasse");
}

export default async function AdminStammdatenPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead = await userHasPermission(session.user.id, membership.organizationId, "org:read");
  const canWrite = await userHasPermission(session.user.id, membership.organizationId, "org:write");
  const canBank = await userHasPermission(session.user.id, membership.organizationId, "bank:read");
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const org = await prisma.organization.findUnique({
    where: { id: membership.organizationId },
    include: { settings: true, bankAccounts: true },
  });
  const settings = org?.settings;
  const publicAddress = resolvePublicCompanyAddress(settings);
  const billingAddress = resolveBillingCompanyAddress(settings);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--gold-soft)]">
          Unternehmen & Seite
        </h1>
        <p className="mt-2 text-[var(--muted)]">{org?.name}</p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />

      <div className="rounded-2xl border border-[var(--tf-line)] bg-[rgba(20,184,166,0.08)] px-4 py-3 text-sm text-[var(--tf-navy)]">
        E-Mail-Versand (SMTP) verwaltest du unter{" "}
        <Link href="/admin/einstellungen/email" className="font-semibold text-[var(--tf-teal-hover)] underline">
          Einstellungen → E-Mail-Konten
        </Link>
        .
      </div>

      <div className="tf-card text-sm">
        <h2 className="text-lg font-semibold">Firmenanschriften</h2>
        <p className="mt-2 text-[var(--muted)]">
          Öffentliche Anschrift erscheint überall kundenseitig (Impressum, Kontakt, Tickets).
          Rechnungsanschrift nur auf Rechnungen und Steuer-/Auszahlungsbelegen — nie öffentlich.
        </p>
        {canWrite && settings ? (
          <form action={updateCompanyAddresses} className="mt-4 grid gap-8 lg:grid-cols-2">
            <fieldset className="grid gap-3">
              <legend className="text-base font-semibold text-[var(--tf-navy)]">
                Öffentlich (Landshut)
              </legend>
              <label className="grid gap-1">
                <span>Straße</span>
                <input
                  name="publicStreet"
                  className="tf-input"
                  required
                  defaultValue={publicAddress.street}
                />
              </label>
              <label className="grid gap-1">
                <span>Hausnummer</span>
                <input
                  name="publicHouseNumber"
                  className="tf-input"
                  required
                  defaultValue={publicAddress.houseNumber}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span>PLZ</span>
                  <input
                    name="publicPostalCode"
                    className="tf-input"
                    required
                    defaultValue={publicAddress.postalCode}
                  />
                </label>
                <label className="grid gap-1">
                  <span>Ort</span>
                  <input
                    name="publicCity"
                    className="tf-input"
                    required
                    defaultValue={publicAddress.city}
                  />
                </label>
              </div>
              <label className="grid gap-1">
                <span>Land (ISO)</span>
                <input
                  name="publicCountry"
                  className="tf-input"
                  defaultValue={publicAddress.country}
                />
              </label>
            </fieldset>
            <fieldset className="grid gap-3">
              <legend className="text-base font-semibold text-[var(--tf-navy)]">
                Rechnung / Steuer (intern)
              </legend>
              <label className="grid gap-1">
                <span>Straße</span>
                <input
                  name="billingStreet"
                  className="tf-input"
                  required
                  defaultValue={billingAddress.street}
                />
              </label>
              <label className="grid gap-1">
                <span>Hausnummer</span>
                <input
                  name="billingHouseNumber"
                  className="tf-input"
                  required
                  defaultValue={billingAddress.houseNumber}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span>PLZ</span>
                  <input
                    name="billingPostalCode"
                    className="tf-input"
                    required
                    defaultValue={billingAddress.postalCode}
                  />
                </label>
                <label className="grid gap-1">
                  <span>Ort</span>
                  <input
                    name="billingCity"
                    className="tf-input"
                    required
                    defaultValue={billingAddress.city}
                  />
                </label>
              </div>
              <label className="grid gap-1">
                <span>Land (ISO)</span>
                <input
                  name="billingCountry"
                  className="tf-input"
                  defaultValue={billingAddress.country}
                />
              </label>
            </fieldset>
            <button type="submit" className="tf-btn tf-btn-primary w-fit lg:col-span-2">
              Anschriften speichern
            </button>
          </form>
        ) : (
          <dl className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">Öffentlich</dt>
              <dd>{formatCompanyAddressLine(publicAddress)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Rechnung / Steuer</dt>
              <dd>{formatCompanyAddressLine(billingAddress)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="tf-card text-sm">
        <h2 className="text-lg font-semibold">Allgemein</h2>
        <dl className="mt-3 grid gap-2 md:grid-cols-2">
          <div>
            <dt className="text-[var(--muted)]">Support-E-Mail</dt>
            <dd>{settings?.supportEmail ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Shop-Domain</dt>
            <dd>{settings?.ticketShopDomain ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Währung</dt>
            <dd>{settings?.defaultCurrency}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Zeitzone</dt>
            <dd>{settings?.defaultTimezone}</dd>
          </div>
        </dl>
      </div>

      <div className="tf-card text-sm">
        <h2 className="text-lg font-semibold">Verwaltungsgebühr</h2>
        <p className="mt-2 text-[var(--muted)]">
          Die einheitliche Verwaltungsgebühr (Standard 4 %) wird zentral unter Einstellungen →
          Preise und Gebühren gepflegt — nicht mehr als Vorverkaufsgebühr.
        </p>
        <Link
          href="/admin/einstellungen/preise"
          className="tf-btn tf-btn-secondary mt-4 inline-flex !min-h-10 text-sm"
        >
          Preise und Gebühren öffnen
        </Link>
      </div>

      <div className="tf-card text-sm">
        <h2 className="text-lg font-semibold">Tracking-Defaults</h2>
        <p className="mt-2 text-[var(--muted)]">
          Organisationsweite Standard-IDs. Events können Overrides setzen oder Defaults übernehmen.
        </p>
        {canWrite && settings ? (
          <form action={updateTrackingDefaults} className="mt-4 grid max-w-xl gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="trackingEnabled"
                defaultChecked={settings.trackingEnabled}
              />
              <span>Tracking aktiv</span>
            </label>
            <label className="grid gap-1">
              <span>GA4 Measurement ID</span>
              <input
                name="trackingGa4MeasurementId"
                className="tf-input"
                placeholder="G-XXXXXXXX"
                defaultValue={settings.trackingGa4MeasurementId ?? ""}
              />
            </label>
            <label className="grid gap-1">
              <span>GTM Container ID</span>
              <input
                name="trackingGtmContainerId"
                className="tf-input"
                placeholder="GTM-XXXXXXX"
                defaultValue={settings.trackingGtmContainerId ?? ""}
              />
            </label>
            <label className="grid gap-1">
              <span>Meta Pixel ID</span>
              <input
                name="trackingMetaPixelId"
                className="tf-input"
                defaultValue={settings.trackingMetaPixelId ?? ""}
              />
            </label>
            <label className="grid gap-1">
              <span>Google Ads ID</span>
              <input
                name="trackingGoogleAdsId"
                className="tf-input"
                placeholder="AW-XXXXXXXX"
                defaultValue={settings.trackingGoogleAdsId ?? ""}
              />
            </label>
            <button type="submit" className="tf-btn tf-btn-primary w-fit">
              Tracking speichern
            </button>
          </form>
        ) : (
          <dl className="mt-3 grid gap-2 md:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">Aktiv</dt>
              <dd>{settings?.trackingEnabled ? "ja" : "nein"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">GA4</dt>
              <dd>{settings?.trackingGa4MeasurementId ?? "—"}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="tf-card text-sm">
        <h2 className="text-lg font-semibold">TSE / KassenSichV</h2>
        <p className="mt-2 text-[var(--muted)]">
          Konzept und Modi: siehe{" "}
          <code className="text-[var(--ink)]">docs/tse-plan.md</code> — zertifizierte Signatur folgt
          mit Provider-Credentials; Steuerberater-Freigabe vor produktivem Bar-Einsatz.
        </p>
        {canWrite && settings ? (
          <form action={updateTse} className="mt-4 grid max-w-xl gap-3">
            <label className="grid gap-1">
              <span>TSE-Modus</span>
              <select name="tseMode" defaultValue={settings.tseMode} className="tf-input">
                <option value="none">none — keine Signatur</option>
                <option value="planned">planned — erfasst, noch nicht rechtsgültig</option>
                <option value="fiskaly">fiskaly — Cloud-TSE (Ziel)</option>
                <option value="external">external — Signatur außerhalb</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span>Client-ID</span>
              <input
                name="tseClientId"
                className="tf-input"
                defaultValue={settings.tseClientId ?? ""}
              />
            </label>
            <label className="grid gap-1">
              <span>TSS-ID</span>
              <input
                name="tseTssId"
                className="tf-input"
                defaultValue={settings.tseTssId ?? ""}
              />
            </label>
            <button type="submit" className="tf-btn tf-btn-primary w-fit">
              TSE speichern
            </button>
          </form>
        ) : (
          <dl className="mt-3 grid gap-2 md:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">Modus</dt>
              <dd>{settings?.tseMode ?? "none"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Client-ID</dt>
              <dd>{settings?.tseClientId ?? "—"}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="tf-card text-sm">
        <h2 className="text-lg font-semibold">Bankdaten</h2>
        {canBank ? (
          org?.bankAccounts.length ? (
            <p className="mt-2">
              {org.bankAccounts.length} Konto(s) hinterlegt (verschlüsselte Felder — Anzeige später
              maskiert).
            </p>
          ) : (
            <p className="mt-2 text-[var(--muted)]">Noch keine Bankverbindung gespeichert.</p>
          )
        ) : (
          <p className="mt-2 text-[var(--danger)]">
            Keine Berechtigung bank:read — Bankdaten werden nicht angezeigt.
          </p>
        )}
      </div>
    </div>
  );
}
