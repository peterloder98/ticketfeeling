import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatEuroFromCents } from "@/lib/money";
import { formatDeDateTime } from "@/lib/datetime-de";
import {
  customerDisplayEmail,
  isAnonymousBoxOfficeCustomer,
  isOrderCountedInRevenue,
  isWalkInCustomerEmail,
} from "@/lib/commerce/customers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kunden" };

type Props = {
  searchParams: Promise<{ q?: string; includeWalkIns?: string }>;
};

export default async function AdminCustomersPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "reports:read"));
  if (!allowed) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const includeWalkIns = sp.includeWalkIns === "1" || sp.includeWalkIns === "on";

  const customers = await prisma.customer.findMany({
    where: {
      organizationId: membership.organizationId,
      // Hide anonymous Tageskasse guests by default — CRM is for real contacts only.
      ...(!includeWalkIns
        ? {
            AND: [
              { NOT: { emailNormalized: { contains: "@ticketfeeling.local" } } },
              {
                NOT: {
                  AND: [
                    { firstName: { equals: "Tageskasse", mode: "insensitive" } },
                    { lastName: { equals: "Gast", mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { emailNormalized: { contains: q.toLowerCase() } },
              { phone: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
              { postalCode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
    include: {
      orders: {
        select: {
          id: true,
          status: true,
          voidedAt: true,
          customerTotalCents: true,
          grossCents: true,
          createdAt: true,
        },
      },
    },
  });

  const rows = customers
    .filter((customer) => includeWalkIns || !isAnonymousBoxOfficeCustomer(customer))
    .map((customer) => {
      const orderCount = customer.orders.length;
      const cancelledCount = customer.orders.filter(
        (o) => o.voidedAt || o.status === "cancelled" || o.status === "refunded",
      ).length;
      const revenueCents = customer.orders
        .filter((o) => isOrderCountedInRevenue(o))
        .reduce((sum, o) => sum + (o.customerTotalCents || o.grossCents), 0);
      const lastOrderAt = customer.orders.reduce<Date | null>((latest, o) => {
        if (!latest || o.createdAt > latest) return o.createdAt;
        return latest;
      }, null);
      const email = customerDisplayEmail(customer.email);
      return {
        customer,
        orderCount,
        cancelledCount,
        revenueCents,
        lastOrderAt,
        email,
        walkIn: isWalkInCustomerEmail(customer.email),
      };
    });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--gold-soft)]">
            Kunden
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Ein Kunde pro E-Mail — Stammdaten, Bestellungen und Umsatz im Überblick.
            Anonyme Tageskasse-Gäste sind ausgeblendet.
          </p>
        </div>
      </div>

      <form
        className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-[rgba(255,255,255,0.03)] p-4 text-sm"
        method="get"
      >
        <label className="grid min-w-[16rem] flex-1 gap-1">
          <span className="text-[var(--muted)]">Suche</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name, E-Mail, Telefon, Ort…"
            className="tf-input"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-[var(--muted)]">
          <input
            type="checkbox"
            name="includeWalkIns"
            value="1"
            defaultChecked={includeWalkIns}
            className="rounded border-[var(--line)]"
          />
          Walk-ins anzeigen
        </label>
        <button type="submit" className="tf-btn tf-btn-secondary !py-2 text-sm">
          Filtern
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--line)]">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[rgba(255,255,255,0.03)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">E-Mail</th>
              <th className="px-3 py-3 font-medium">Ort</th>
              <th className="px-3 py-3 font-medium text-right">Bestellungen</th>
              <th className="px-3 py-3 font-medium text-right">Umsatz</th>
              <th className="px-3 py-3 font-medium">Letzter Kauf</th>
              <th className="px-3 py-3 font-medium text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(
              ({ customer, orderCount, cancelledCount, revenueCents, lastOrderAt, email, walkIn }) => (
                <tr key={customer.id} className="border-b border-[var(--line)]/70">
                  <td className="px-3 py-3">
                    <p className="font-semibold">
                      {customer.firstName} {customer.lastName}
                    </p>
                    {customer.phone ? (
                      <p className="text-xs text-[var(--muted)]">{customer.phone}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {email ? (
                      <span>{email}</span>
                    ) : (
                      <span className="text-[var(--muted)]">
                        {walkIn ? "ohne E-Mail (Walk-in)" : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--muted)]">
                    {[customer.postalCode, customer.city].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {orderCount}
                    {cancelledCount > 0 ? (
                      <span className="ml-1 text-xs text-[var(--danger)]">
                        ({cancelledCount} storn.)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums">
                    {formatEuroFromCents(revenueCents)}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                    {lastOrderAt ? formatDeDateTime(lastOrderAt) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/kunden/${customer.id}`}
                      className="text-[var(--gold-soft)] underline underline-offset-2"
                    >
                      Öffnen
                    </Link>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-[var(--muted)]">
            Keine Kunden{q ? " für diese Suche" : ""}.
          </p>
        ) : null}
      </div>
      {rows.length >= 200 ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Es werden maximal 200 Kunden angezeigt — Suche eingrenzen.
        </p>
      ) : null}
    </div>
  );
}
