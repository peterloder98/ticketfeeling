import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import { formatEuroFromCents } from "@/lib/money";
import { ADMIN_SUBNAV } from "@/lib/admin/nav";
import { AdminSubnav } from "@/components/admin/admin-subnav";

export const dynamic = "force-dynamic";

async function requireDiscountWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed =
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write"));
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

async function createDiscount(formData: FormData) {
  "use server";
  const { session, membership } = await requireDiscountWrite();

  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  const type = String(formData.get("type") ?? "percent");
  if (!code) throw new Error("CODE_REQUIRED");
  if (type !== "percent" && type !== "fixed") throw new Error("INVALID_TYPE");

  const rawValue = Number(String(formData.get("value") ?? "0").replace(",", "."));
  if (!Number.isFinite(rawValue) || rawValue <= 0) throw new Error("INVALID_VALUE");

  const value =
    type === "percent"
      ? Math.max(1, Math.round(rawValue * 100))
      : Math.max(1, Math.round(rawValue * 100));

  const eventIdRaw = String(formData.get("eventId") ?? "").trim();
  const eventId = eventIdRaw || null;
  if (eventId) {
    const event = await prisma.event.findFirst({
      where: { id: eventId, organizationId: membership.organizationId },
    });
    if (!event) throw new Error("EVENT_NOT_FOUND");
  }

  const maxRaw = String(formData.get("maxRedemptions") ?? "").trim();
  const maxRedemptions = maxRaw ? Math.max(1, Math.round(Number(maxRaw))) : null;
  const minOrderEuros = Number(String(formData.get("minOrderEuros") ?? "0").replace(",", "."));
  const minOrderCents = Math.max(
    0,
    Math.round((Number.isFinite(minOrderEuros) ? minOrderEuros : 0) * 100),
  );
  const active = formData.get("active") === "on";

  const created = await prisma.discountCode.create({
    data: {
      organizationId: membership.organizationId,
      eventId,
      code,
      type,
      value,
      minOrderCents,
      maxRedemptions,
      active,
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "discount.created",
    entityType: "discount_code",
    entityId: created.id,
    after: {
      code,
      type,
      value,
      eventId,
      maxRedemptions,
      minOrderCents,
      active,
    },
  });

  revalidatePath("/admin/discounts");
}

async function createGiftCard(formData: FormData) {
  "use server";
  const { session, membership } = await requireDiscountWrite();

  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!code) throw new Error("CODE_REQUIRED");

  const euros = Number(String(formData.get("initialEuros") ?? "0").replace(",", "."));
  const initialCents = Math.max(1, Math.round((Number.isFinite(euros) ? euros : 0) * 100));

  const created = await prisma.giftCard.create({
    data: {
      organizationId: membership.organizationId,
      code,
      initialCents,
      balanceCents: initialCents,
      status: "active",
    },
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "gift_card.created",
    entityType: "gift_card",
    entityId: created.id,
    after: { code, initialCents },
  });

  revalidatePath("/admin/discounts");
}

export default async function AdminDiscountsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) return <p>Keine Organisation.</p>;

  const canRead =
    (await userHasPermission(session.user.id, membership.organizationId, "org:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:read")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write"));
  if (!canRead) return <p className="text-[var(--danger)]">Keine Berechtigung.</p>;

  const canWrite =
    (await userHasPermission(session.user.id, membership.organizationId, "org:write")) ||
    (await userHasPermission(session.user.id, membership.organizationId, "events:write"));

  const [discounts, giftCards, events] = await Promise.all([
    prisma.discountCode.findMany({
      where: { organizationId: membership.organizationId },
      include: { event: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.giftCard.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.event.findMany({
      where: { organizationId: membership.organizationId },
      select: { id: true, name: true },
      orderBy: { eventStartsAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--gold-soft)]">
          Rabatte & Gutscheine
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Discount-Codes und Geschenkkarten für den Checkout. Rabattcodes lassen sich nicht mit
          laufenden Aktionspreisen (Kampagnen) kombinieren — die Aktion hat Vorrang. Gutscheine
          bleiben nutzbar.
        </p>
      </div>
      <AdminSubnav items={ADMIN_SUBNAV.verkauf} />

      <div className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-4 py-3 text-sm text-[var(--tf-navy)]">
        <p className="font-semibold">Preisaktion / Rabattaktion (ohne Code)?</p>
        <p className="mt-1 text-[var(--tf-text-secondary)]">
          Frühbucher, Black Week usw. legst du am{" "}
          <a href="/admin/events" className="font-medium text-[var(--tf-teal)] hover:underline">
            Event
          </a>{" "}
          oder an der{" "}
          <a href="/admin/tours" className="font-medium text-[var(--tf-teal)] hover:underline">
            Tour
          </a>{" "}
          an — Abschnitt „Rabatte &amp; Aktionen“ / „Preisaktionen“. Dort wählst du Preiskategorien
          und Tour-Termine.
        </p>
      </div>
      {canWrite ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={createDiscount} className="tf-card grid gap-3 text-sm">
            <h2 className="text-lg font-semibold">Rabattcode anlegen</h2>
            <label className="grid gap-1">
              <span>Code</span>
              <input name="code" className="tf-input" required placeholder="SOMMER10" />
            </label>
            <label className="grid gap-1">
              <span>Typ</span>
              <select name="type" className="tf-input" defaultValue="percent">
                <option value="percent">Prozent</option>
                <option value="fixed">Festbetrag (€)</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span>Wert (% oder €)</span>
              <input
                name="value"
                type="number"
                min="0.01"
                step="0.01"
                className="tf-input"
                required
              />
            </label>
            <label className="grid gap-1">
              <span>Event (optional)</span>
              <select name="eventId" className="tf-input" defaultValue="">
                <option value="">Alle Events</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span>Max. Einlösungen (optional)</span>
              <input name="maxRedemptions" type="number" min="1" className="tf-input" />
            </label>
            <label className="grid gap-1">
              <span>Mindestbestellung (€)</span>
              <input
                name="minOrderEuros"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                className="tf-input"
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="active" defaultChecked />
              <span>Aktiv</span>
            </label>
            <button type="submit" className="tf-btn tf-btn-primary w-fit">
              Rabatt anlegen
            </button>
          </form>

          <form action={createGiftCard} className="tf-card grid gap-3 text-sm">
            <h2 className="text-lg font-semibold">Geschenkkarte anlegen</h2>
            <label className="grid gap-1">
              <span>Code</span>
              <input name="code" className="tf-input" required placeholder="GIFT-100" />
            </label>
            <label className="grid gap-1">
              <span>Anfangswert (€)</span>
              <input
                name="initialEuros"
                type="number"
                min="0.01"
                step="0.01"
                className="tf-input"
                required
              />
            </label>
            <button type="submit" className="tf-btn tf-btn-primary w-fit">
              Geschenkkarte anlegen
            </button>
          </form>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--gold-soft)]">
          Rabattcodes
        </h2>
        {discounts.map((d) => (
          <div key={d.id} className="tf-card text-sm">
            <p className="font-semibold font-mono">{d.code}</p>
            <p className="mt-1 text-[var(--muted)]">
              {d.type === "percent"
                ? `${(d.value / 100).toFixed(2)} %`
                : formatEuroFromCents(d.value)}
              {" · "}
              {d.active ? "aktiv" : "inaktiv"}
              {" · "}
              {d.redemptionCount}
              {d.maxRedemptions != null ? ` / ${d.maxRedemptions}` : ""} Einlösungen
              {d.minOrderCents > 0
                ? ` · min. ${formatEuroFromCents(d.minOrderCents)}`
                : ""}
              {d.event ? ` · ${d.event.name}` : " · alle Events"}
            </p>
          </div>
        ))}
        {discounts.length === 0 ? (
          <p className="text-[var(--muted)]">Noch keine Rabattcodes.</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--gold-soft)]">
          Geschenkkarten
        </h2>
        {giftCards.map((g) => (
          <div key={g.id} className="tf-card text-sm">
            <p className="font-semibold font-mono">{g.code}</p>
            <p className="mt-1 text-[var(--muted)]">
              Saldo {formatEuroFromCents(g.balanceCents)} / Start{" "}
              {formatEuroFromCents(g.initialCents)} · {g.status}
            </p>
          </div>
        ))}
        {giftCards.length === 0 ? (
          <p className="text-[var(--muted)]">Noch keine Geschenkkarten.</p>
        ) : null}
      </section>
    </div>
  );
}
