import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEventCheckinStats } from "@/lib/commerce/checkin";
import { ScannerClient } from "@/components/scanner-client";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import Link from "next/link";
import { MapPin, Calendar } from "lucide-react";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Einlass-Scanner",
  manifest: "/scanner-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TF Scanner",
    statusBarStyle: "black-translucent",
  },
};

export default async function ScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/scanner");

  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");

  const canScan =
    (await userHasPermission(session.user.id, membership.organizationId, "checkin:scan")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  const canRead =
    canScan ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:read"));

  if (!canRead) {
    return (
      <div className="px-4 py-10 text-center md:text-left">
        <p className="text-[#fca5a5] md:text-[var(--danger)]">Keine Berechtigung für den Scanner.</p>
        <Link href="/admin" className="mt-4 inline-block text-[var(--tf-teal)] underline">
          Zum Admin
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const events = await prisma.event.findMany({
    where: {
      organizationId: membership.organizationId,
      status: { in: ["presale_active", "published", "announcement", "sold_out", "completed"] },
    },
    orderBy: { eventStartsAt: "asc" },
    select: {
      id: true,
      name: true,
      eventStartsAt: true,
      doorsOpenAt: true,
      status: true,
      location: { select: { name: true, city: true } },
    },
  });

  const eventId = sp.event && events.some((e) => e.id === sp.event) ? sp.event : null;
  const selected = events.find((e) => e.id === eventId) ?? null;
  const stats = eventId ? await getEventCheckinStats(eventId) : null;

  if (selected && canScan && stats) {
    return (
      <ScannerClient
        eventId={selected.id}
        eventName={selected.name}
        initialStats={stats}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] md:mx-0 md:max-w-3xl md:px-0 md:pb-0 md:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
            Ticketfeeling Einlass
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white md:text-[var(--tf-navy)]">
            Scanner
          </h1>
          <p className="mt-2 text-sm text-white/70 md:text-[var(--tf-text-secondary)]">
            <span className="md:hidden">Event wählen — danach Fullscreen-Scan.</span>
            <span className="hidden md:inline">
              Event wählen — Scanner bleibt in der Desktop-App integriert.
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Link
            href="/admin"
            className="rounded-lg px-3 py-2 text-sm font-medium text-white/90 ring-1 ring-white/20 hover:bg-white/10 md:hidden"
          >
            Zum Admin
          </Link>
          <Link
            href="/admin/verkauf"
            className="rounded-lg px-3 py-2 text-sm text-white/80 ring-1 ring-white/20 hover:bg-white/10 md:hidden"
          >
            Verkauf
          </Link>
        </div>
      </div>
      <div className="mt-4 hidden md:block">
        <AdminSubnav items={ADMIN_SUBNAV.verkauf} />
      </div>

      {!canScan ? (
        <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100 md:border-[var(--tf-line)] md:bg-[rgba(245,158,11,0.08)] md:text-[var(--tf-text)]">
          Du darfst Kennzahlen sehen, aber nicht scannen.
        </p>
      ) : null}

      {selected && stats && !canScan ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            ["Verkauft", stats.sold],
            ["Aktuell IN", stats.currentlyIn],
            ["OUT", stats.currentlyOut],
            ["Noch nicht da", stats.notArrived],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl bg-white/10 p-4 md:border md:border-[var(--tf-line)] md:bg-white md:shadow-sm"
            >
              <p className="text-xs text-white/60 md:text-[var(--tf-text-secondary)]">{label}</p>
              <p className="text-2xl font-semibold tabular-nums text-white md:text-[var(--tf-navy)]">
                {value}
              </p>
            </div>
          ))}
          <Link href="/scanner" className="col-span-2 text-center text-sm text-[var(--tf-teal)]">
            Anderes Event
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/scanner?event=${event.id}`}
              className="block rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 transition hover:bg-white/[0.14] hover:ring-[var(--tf-teal)]/50 md:bg-white md:text-[var(--tf-text)] md:shadow-[var(--tf-shadow)] md:ring-[var(--tf-line)] md:hover:bg-white md:hover:ring-[var(--tf-teal)]"
            >
              <p className="text-lg font-semibold leading-snug text-white md:text-[var(--tf-navy)]">
                {event.name}
              </p>
              <p className="mt-2 inline-flex items-start gap-2 text-sm text-white/75 md:text-[var(--tf-text-secondary)]">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tf-teal)]" />
                <span>
                  {event.eventStartsAt
                    ? event.eventStartsAt.toLocaleString("de-DE", {
                        timeZone: "Europe/Berlin",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Termin offen"}
                </span>
              </p>
              {event.location?.name ? (
                <p className="mt-1 inline-flex items-start gap-2 text-sm text-white/70 md:text-[var(--tf-text-secondary)]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tf-teal)]" />
                  <span>
                    {event.location.name}
                    {event.location.city ? `, ${event.location.city}` : ""}
                  </span>
                </p>
              ) : null}
            </Link>
          ))}
          {events.length === 0 ? (
            <p className="text-white/60 md:text-[var(--tf-text-secondary)]">Kein Event verfügbar.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
