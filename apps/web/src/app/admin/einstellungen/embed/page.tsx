import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { EmbedCodePanel } from "@/components/admin/embed-code-panel";
import { getEmbedAppUrl, getEmbedFrameAncestors } from "@/lib/embed/public-url";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website-Einbindung (iframe)" };

export default async function EmbedSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "events:read",
  );
  if (!canRead) {
    return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;
  }

  const appUrl = getEmbedAppUrl();
  const ancestors = getEmbedFrameAncestors();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
          Einstellungen
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          Website-Einbindung
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--tf-text-secondary)]">
          Ticketshop als iframe einbinden. Breite und Höhe wählst du im Code-Dialog (Standard + Fest =
          bisheriges Verhalten). Kompletter Kauf — Warenkorb, Kasse, Zahlung und Tickets — bleibt im
          iframe.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.einstellungen} />

      <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] px-4 py-3 text-sm text-[var(--tf-text-secondary)]">
        iframe-Basis (fest):{" "}
        <a href={appUrl} className="font-medium text-[var(--tf-navy)] underline" target="_blank" rel="noreferrer">
          {appUrl}
        </a>
        . Später eigene Domain über Env <code>NEXT_PUBLIC_APP_URL</code>.
      </div>

      <EmbedCodePanel
        kind="shop"
        title="Gesamtshop – alle laufenden Events"
        description="Zeigt die aktuelle Eventliste. Nach Klick auf ein Event erscheint der Ticketverkauf für genau dieses Event."
      />

      <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5 text-sm">
        <h2 className="font-semibold text-[var(--tf-navy)]">Einzelnes Event</h2>
        <p className="mt-1 text-[var(--tf-text-secondary)]">
          Den iframe-Code für ein bestimmtes Event findest du auf der jeweiligen Event-Detailseite
          unter „Website-Einbindung“.
        </p>
        <Link href="/admin/events" className="tf-btn tf-btn-secondary mt-4 !min-h-10 text-sm">
          Zu den Events
        </Link>
      </div>

      <div className="rounded-2xl border border-[var(--tf-line)] bg-[#f8fafc] p-5 text-sm">
        <h2 className="font-semibold text-[var(--tf-navy)]">Hinweise für die Einbindung</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[var(--tf-text-secondary)]">
          <li>
            Basis-URL im Code: <code className="text-[var(--tf-navy)]">{appUrl}</code>
          </li>
          <li>
            Framing:{" "}
            {ancestors.includes("*")
              ? "alle Domains erlaubt (Standard)"
              : `nur ${ancestors.join(", ")}`}
            . Optional Env <code>EMBED_FRAME_ANCESTORS</code>.
          </li>
          <li>
            Optional <code>TRACKING_LINKER_DOMAINS</code> für Cross-Domain-Tracking.
          </li>
          <li>
            Parent kann Consent übergeben:{" "}
            <code>{`iframe.contentWindow.postMessage({type:'tf:consent',statistics:true,marketing:true}, '*')`}</code>
          </li>
          <li>
            Bei Höhe „Automatisch“ empfängt die Host-Seite Höhe via Message-Typ{" "}
            <code>tf:embed-height</code> (im Snippet enthalten). „Fest“ braucht kein Script.
          </li>
        </ul>
      </div>
    </div>
  );
}
