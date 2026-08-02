import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { BoxOfficeForm } from "@/components/box-office-form";
import { BoxOfficeSessionPanel } from "@/components/box-office-session-panel";
import { formatEuroFromCents } from "@/lib/money";
import { ChannelBadge } from "@/components/channel-badge";
import { getBoxOfficeSellableEventIds } from "@/lib/commerce/box-office-access";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { resolveActivePlatformFeeConfig } from "@/lib/commerce/platform-fee";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tageskasse" };

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default async function BoxOfficePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");

  const canSell =
    (await userHasPermission(session.user.id, membership.organizationId, "box_office:sell")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write"));
  if (!canSell) {
    return (
      <p className="tf-container py-8 text-[var(--danger)]">
        Keine Berechtigung für die Tageskasse.
      </p>
    );
  }

  const sellableIds = await getBoxOfficeSellableEventIds(
    session.user.id,
    membership.organizationId,
  );
  const isPartner = sellableIds !== null;

  const today = startOfDay();
  const [orgSettings, events, todaySales] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId: membership.organizationId },
      select: { platformFeeConfig: true },
    }),
    prisma.event.findMany({
      where: {
        organizationId: membership.organizationId,
        status: { in: ["presale_active", "published"] },
        ...(sellableIds ? { id: { in: sellableIds } } : {}),
      },
      include: {
        location: { select: { name: true, city: true } },
        ticketCategories: {
          where: { status: "active", boxOfficeBookable: true },
          include: { pools: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { eventStartsAt: "asc" },
    }),
    prisma.order.findMany({
      where: {
        organizationId: membership.organizationId,
        channel: "box_office",
        createdAt: { gte: today },
        voidedAt: null,
        ...(isPartner ? { soldByUserId: session.user.id } : {}),
      },
      include: { tickets: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const feeConfig = resolveActivePlatformFeeConfig(orgSettings?.platformFeeConfig);
  const now = Date.now();

  const payload = events.map((event) => ({
    id: event.id,
    name: event.name,
    whenLabel: event.eventStartsAt
      ? event.eventStartsAt.toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
    locationLabel: event.location
      ? `${event.location.name}${event.location.city ? `, ${event.location.city}` : ""}`
      : null,
    categories: event.ticketCategories.map((category) => {
      const pool =
        category.pools.find((p) => p.channel === "box_office") ??
        category.pools.find((p) => p.channel === "online");
      const available = pool
        ? Math.max(0, pool.capacity - pool.soldQuantity - pool.heldQuantity)
        : Math.max(0, category.capacity - category.safetyReserve);
      let saleLabel: string | null = null;
      if (category.saleEndsAt && category.saleEndsAt.getTime() > now) {
        saleLabel = "Zeitlich begrenzt";
      } else if (category.saleStartsAt && category.saleStartsAt.getTime() > now) {
        saleLabel = "Verkauf startet später";
      }
      return {
        id: category.id,
        name: category.name,
        description: category.description,
        priceGrossCents: category.priceGrossCents,
        available,
        saleLabel,
      };
    }),
  }));

  const todayGross = todaySales.reduce(
    (s, o) => s + (o.customerTotalCents || o.grossCents),
    0,
  );
  const todayTickets = todaySales.reduce((s, o) => s + o.tickets.length, 0);

  return (
    <div className="tf-container space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge channel="box_office" />
            <span className="text-xs text-[var(--tf-text-secondary)]">Verkauf vor Ort</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--tf-navy)] md:text-4xl">
            Tageskasse
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--tf-text-secondary)]">
            {isPartner
              ? "Dein Vorverkaufszugang — nur freigegebene Events."
              : "Event wählen → Tickets → Kunde → Bar oder Karte → Tickets ausgeben."}
          </p>
        </div>
        <Link href="/kasse/verkaeufe" className="tf-btn tf-btn-secondary !py-2 text-sm">
          {isPartner ? "Meine Verkäufe" : "Verkaufsübersicht"}
        </Link>
      </div>
      {!isPartner ? <AdminSubnav items={ADMIN_SUBNAV.verkauf} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <p className="text-sm text-[var(--tf-text-secondary)]">
            {isPartner ? "Meine Verkäufe heute" : "Verkäufe heute"}
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">{todaySales.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <p className="text-sm text-[var(--tf-text-secondary)]">Tickets heute</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">{todayTickets}</p>
        </div>
        <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-4">
          <p className="text-sm text-[var(--tf-text-secondary)]">Umsatz heute</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--tf-navy)]">
            {formatEuroFromCents(todayGross)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-[0_8px_28px_rgba(15,39,71,0.05)] md:p-6">
        <BoxOfficeForm
          events={payload}
          feeConfig={{
            enabled: feeConfig.enabled,
            percentageBasisPoints: feeConfig.percentageBasisPoints,
            displayName: feeConfig.displayName,
          }}
        />
      </div>

      <section className="w-full space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">
            {isPartner ? "Meine Verkäufe heute" : "Verkäufe heute"}
          </h2>
          <Link
            href="/kasse/verkaeufe"
            className="text-sm font-medium text-[var(--tf-teal)] hover:underline"
          >
            Vollständige Übersicht →
          </Link>
        </div>
        <div className="w-full overflow-x-auto rounded-2xl border border-[var(--tf-line)] bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-[var(--tf-line)] bg-[#f8fafc] text-[var(--tf-text-secondary)]">
              <tr>
                <th className="px-3 py-3 font-medium">Zeit</th>
                <th className="px-3 py-3 font-medium">Beleg</th>
                <th className="px-3 py-3 font-medium">Event / Positionen</th>
                <th className="px-3 py-3 font-medium">Tickets</th>
                <th className="px-3 py-3 font-medium text-right">Betrag</th>
                <th className="px-3 py-3 font-medium text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {todaySales.map((order) => {
                const lines = order.items
                  .map((i) => `${i.quantity}× ${i.categorySnapshot}`)
                  .join(", ");
                return (
                  <tr key={order.id} className="border-b border-[var(--tf-line)]/80">
                    <td className="px-3 py-3 whitespace-nowrap text-[var(--tf-text-secondary)]">
                      {order.createdAt.toLocaleTimeString("de-DE", {
                        timeZone: "Europe/Berlin",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/kasse/beleg/${order.id}`}
                        className="font-semibold text-[var(--tf-navy)] hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-[var(--tf-navy)]">
                        {order.items[0]?.eventNameSnapshot ?? "—"}
                      </p>
                      <p className="text-xs text-[var(--tf-text-secondary)]">{lines || "—"}</p>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-[var(--tf-text-secondary)]">
                      {order.tickets.length}
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {formatEuroFromCents(order.customerTotalCents || order.grossCents)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/kasse/beleg/${order.id}`}
                        className="text-xs font-medium text-[var(--tf-teal)] hover:underline"
                      >
                        Öffnen
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {todaySales.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--tf-text-secondary)]">
              Heute noch keine Verkäufe.
            </p>
          ) : null}
        </div>
      </section>

      {!isPartner ? (
        <details className="rounded-2xl border border-[var(--tf-line)] bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-[var(--tf-navy)]">
            Optional: Kassenschicht (Bar-Anfangs-/Endbestand)
          </summary>
          <p className="mt-2 text-[var(--tf-text-secondary)]">
            Nicht nötig zum Verkaufen. Nur sinnvoll, wenn du den Bargeldbestand in der Kasse
            dokumentieren und am Schichtende abgleichen willst.
          </p>
          <div className="mt-4">
            <BoxOfficeSessionPanel />
          </div>
        </details>
      ) : null}
    </div>
  );
}
