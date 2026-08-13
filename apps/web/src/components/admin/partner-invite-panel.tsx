"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EventGrantPicker,
  type EventGrantOption,
} from "@/components/admin/event-grant-picker";
import { formatDeDateTime } from "@/lib/datetime-de";

type InviteRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  invitedAt: string;
  expiresAt: string;
  token?: string;
  events: { event: { id: string; name: string; optionLabel?: string } }[];
  invitedBy: { email: string | null; name: string | null };
};

type GrantRow = {
  id: string;
  user: { id: string; email: string; name: string | null };
  event: { id: string; name: string; optionLabel?: string };
  createdAt: string;
};

type CategoryOption = {
  id: string;
  eventId: string;
  name: string;
  priceGrossCents: number;
};

type ConsignmentRow = {
  id: string;
  orderNumber: string;
  createdAt: string;
  voidedAt: string | null;
  deliveryStatus: string;
  partner: { id: string | null; email: string; name: string | null };
  eventName: string;
  categoryName: string;
  allocated: number;
  activeCount: number;
  assignedCount?: number;
  soldCount?: number;
  voidedCount: number;
  status: "open" | "settled" | "cancelled" | "sold_out";
};

type PartnerGroup = {
  userId: string;
  email: string;
  name: string | null;
  grants: GrantRow[];
};

function errorLabel(code: string | undefined): string {
  switch (code) {
    case "EVENT_REQUIRED":
      return "Bitte mindestens ein Event freigeben.";
    case "EVENT_NOT_FOUND":
      return "Event nicht gefunden.";
    case "PARTNER_NOT_FOUND":
      return "Vorverkaufsstelle nicht gefunden.";
    case "NOT_BOX_OFFICE_PARTNER":
      return "Diese Person ist keine Vorverkaufsstelle.";
    case "CATEGORY_UNAVAILABLE":
      return "Kategorie nicht verfügbar für die Tageskasse.";
    case "INSUFFICIENT_STOCK":
    case "SOLD_OUT":
      return "Nicht genug Kontingent frei (Online + Tageskasse teilen sich das Kontingent).";
    case "INVALID_QUANTITY":
      return "Menge ungültig (1–50).";
    case "NOTHING_TO_CANCEL":
      return "Keine offenen Tickets mehr zum Stornieren.";
    case "NO_CHANGES":
      return "Keine Änderung.";
    default:
      return code ?? "Aktion fehlgeschlagen";
  }
}

export function PartnerInvitePanel({
  events,
  categories,
  initialInvites,
  initialGrants,
  initialConsignments,
}: {
  events: EventGrantOption[];
  categories: CategoryOption[];
  initialInvites: InviteRow[];
  initialGrants: GrantRow[];
  initialConsignments: ConsignmentRow[];
}) {
  const router = useRouter();
  const [invites, setInvites] = useState(initialInvites);
  const [grants, setGrants] = useState(initialGrants);
  const [consignments, setConsignments] = useState(initialConsignments);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [grantUserId, setGrantUserId] = useState<string | null>(null);
  const [grantAddIds, setGrantAddIds] = useState<string[]>([]);
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [grantErr, setGrantErr] = useState<string | null>(null);

  const [cPartnerId, setCPartnerId] = useState("");
  const [cEventId, setCEventId] = useState("");
  const [cCategoryId, setCCategoryId] = useState("");
  const [cQty, setCQty] = useState(10);
  const [cBusy, setCBusy] = useState(false);
  const [cMsg, setCMsg] = useState<string | null>(null);
  const [cErr, setCErr] = useState<string | null>(null);

  const partners = useMemo(() => {
    const map = new Map<string, PartnerGroup>();
    for (const g of grants) {
      const existing = map.get(g.user.id);
      if (existing) {
        existing.grants.push(g);
      } else {
        map.set(g.user.id, {
          userId: g.user.id,
          email: g.user.email,
          name: g.user.name,
          grants: [g],
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email, "de"),
    );
  }, [grants]);

  const grantTarget = partners.find((p) => p.userId === grantUserId) ?? null;
  const grantExcludeIds = grantTarget?.grants.map((g) => g.event.id) ?? [];

  const partnerCategories = useMemo(
    () => categories.filter((c) => c.eventId === cEventId),
    [categories, cEventId],
  );

  const consignmentSummary = useMemo(() => {
    let allocated = 0;
    let remaining = 0;
    let voided = 0;
    let openRows = 0;
    for (const row of consignments) {
      allocated += row.allocated;
      remaining += row.assignedCount ?? row.activeCount;
      voided += row.voidedCount;
      if (row.status === "open") openRows += 1;
    }
    return { allocated, remaining, voided, openRows, rows: consignments.length };
  }, [consignments]);

  function exportConsignmentsCsv() {
    const header = [
      "Vorgang",
      "Datum",
      "Partner",
      "E-Mail",
      "Event",
      "Kategorie",
      "Vorgebucht",
      "Rest_aktiv",
      "Storniert",
      "Status",
    ];
    const lines = consignments.map((row) =>
      [
        row.orderNumber,
        row.createdAt,
        row.partner.name ?? "",
        row.partner.email,
        row.eventName,
        row.categoryName,
        String(row.allocated),
        String(row.activeCount),
        String(row.voidedCount),
        row.status,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kontingente-vorverkauf-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/v1/admin/box-office/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, firstName, lastName, eventIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(errorLabel(data?.error?.code));
        return;
      }
      const sentEmail = email;
      const sentFirst = firstName;
      const sentLast = lastName;
      const sentEvents = [...eventIds];
      setOk(
        `Einladung an ${sentEmail} gesendet.${
          data.invite.acceptPath
            ? ` Link (falls Mail stub): ${typeof window !== "undefined" ? window.location.origin : ""}${data.invite.acceptPath}`
            : ""
        }`,
      );
      setEmail("");
      setFirstName("");
      setLastName("");
      setEventIds([]);
      setInvites((prev) => [
        {
          id: data.invite.id,
          email: data.invite.email,
          firstName: sentFirst,
          lastName: sentLast,
          status: data.invite.status,
          invitedAt: new Date().toISOString(),
          expiresAt: data.invite.expiresAt,
          token:
            typeof data.invite.acceptPath === "string"
              ? String(data.invite.acceptPath).replace("/einladung/", "")
              : undefined,
          events: events
            .filter((ev) => sentEvents.includes(ev.id))
            .map((ev) => ({
              event: { id: ev.id, name: ev.name, optionLabel: ev.optionLabel },
            })),
          invitedBy: { email: "Sie", name: null },
        },
        ...prev,
      ]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function openGrantEditor(userId: string) {
    setGrantUserId(userId);
    setGrantAddIds([]);
    setGrantMsg(null);
    setGrantErr(null);
  }

  async function saveGrants() {
    if (!grantUserId || grantAddIds.length < 1) return;
    setGrantBusy(true);
    setGrantErr(null);
    setGrantMsg(null);
    try {
      const res = await fetch("/api/v1/admin/box-office/grants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: grantUserId, addEventIds: grantAddIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGrantErr(errorLabel(data?.error?.code));
        return;
      }
      const partner = partners.find((p) => p.userId === grantUserId);
      if (partner && Array.isArray(data.grants)) {
        const nextRows: GrantRow[] = data.grants.map(
          (g: {
            id: string;
            createdAt: string;
            event: { id: string; name: string; optionLabel: string };
          }) => ({
            id: g.id,
            createdAt: typeof g.createdAt === "string" ? g.createdAt : new Date(g.createdAt).toISOString(),
            user: { id: partner.userId, email: partner.email, name: partner.name },
            event: g.event,
          }),
        );
        setGrants((prev) => [
          ...prev.filter((g) => g.user.id !== grantUserId),
          ...nextRows,
        ]);
      }
      setGrantMsg("Events freigegeben.");
      setGrantAddIds([]);
      setGrantUserId(null);
      router.refresh();
    } finally {
      setGrantBusy(false);
    }
  }

  async function removeGrant(userId: string, eventId: string) {
    if (!confirm("Event-Freigabe wirklich entfernen?")) return;
    setGrantBusy(true);
    setGrantErr(null);
    try {
      const res = await fetch("/api/v1/admin/box-office/grants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, removeEventIds: [eventId] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGrantErr(errorLabel(data?.error?.code));
        return;
      }
      setGrants((prev) => prev.filter((g) => !(g.user.id === userId && g.event.id === eventId)));
      router.refresh();
    } finally {
      setGrantBusy(false);
    }
  }

  async function allocateConsignment(e: FormEvent) {
    e.preventDefault();
    setCBusy(true);
    setCErr(null);
    setCMsg(null);
    try {
      const res = await fetch("/api/v1/admin/box-office/consignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerUserId: cPartnerId,
          eventId: cEventId,
          categoryId: cCategoryId,
          quantity: cQty,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCErr(errorLabel(data?.error?.code));
        return;
      }
      setCMsg(
        `Kontingent gebucht (${data.orderNumber}). PDF öffnen und Tickets drucken — Rest später stornieren.`,
      );
      if (data.pdfPath) {
        window.open(data.pdfPath, "_blank", "noopener,noreferrer");
      }
      const listRes = await fetch("/api/v1/admin/box-office/consignments");
      if (listRes.ok) {
        const listData = await listRes.json();
        if (Array.isArray(listData.consignments)) {
          setConsignments(listData.consignments);
        }
      }
      router.refresh();
    } finally {
      setCBusy(false);
    }
  }

  async function printConsignment(orderId: string) {
    window.open(`/api/v1/orders/${orderId}/pdf`, "_blank", "noopener,noreferrer");
    await fetch("/api/v1/box-office/delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, action: "print" }),
    });
    router.refresh();
  }

  async function cancelRemaining(orderId: string) {
    if (
      !confirm(
        "Alle noch nicht verkauften (aktiven) Tickets dieses Kontingents stornieren? Das Kontingent geht zurück ins Online-Angebot.",
      )
    ) {
      return;
    }
    setCBusy(true);
    setCErr(null);
    try {
      const res = await fetch(`/api/v1/admin/box-office/consignments/${orderId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setCErr(errorLabel(data?.error?.code));
        return;
      }
      setCMsg(`${data.voidedTicketIds?.length ?? 0} Tickets storniert.`);
      setConsignments((prev) =>
        prev.map((row) =>
          row.id === orderId
            ? {
                ...row,
                activeCount: 0,
                voidedCount: row.voidedCount + (data.voidedTicketIds?.length ?? 0),
                status: "cancelled",
                voidedAt: new Date().toISOString(),
              }
            : row,
        ),
      );
      router.refresh();
    } finally {
      setCBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="tf-card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">
            Vorverkaufsstelle einladen
          </h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Die Person erhält eine E-Mail mit Link für Zugang und Passwort. Rolle:
            „Vorverkaufsstelle“ — Login führt direkt zur Tageskasse, nur freigegebene Events,
            kein Admin-Menü. Weitere Events kannst du später unter „Aktive Vorverkaufsstellen“
            freigeben.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>Vorname</span>
            <input
              className="tf-input"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Nachname</span>
            <input
              className="tf-input"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm">
          <span>E-Mail</span>
          <input
            type="email"
            className="tf-input"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <EventGrantPicker
          events={events}
          selectedIds={eventIds}
          onChange={setEventIds}
          legend="Freigabe für die Tageskasse"
          hint="Suche und wähle die Events aus. Gleichnamige Termine (z. B. Weihnachtstraum) erkennst du an Datum und Ort."
        />

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {ok ? <p className="text-sm text-[var(--tf-navy)]">{ok}</p> : null}
        <button type="submit" className="tf-btn tf-btn-primary" disabled={busy || eventIds.length < 1}>
          {busy ? "Sendet…" : "Einladung per E-Mail senden"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Einladungen</h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--tf-line)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] text-[var(--tf-text-secondary)]">
              <tr>
                <th className="px-3 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Events</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Gesendet</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-b border-[var(--tf-line)]/70">
                  <td className="px-3 py-2">
                    <p className="font-medium">
                      {inv.firstName} {inv.lastName}
                    </p>
                    <p className="text-xs text-[var(--tf-text-secondary)]">{inv.email}</p>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {inv.events.map((e) => e.event.optionLabel ?? e.event.name).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <p>{inv.status}</p>
                    {inv.status === "pending" && inv.token ? (
                      <a
                        href={`/einladung/${inv.token}`}
                        className="text-xs text-[var(--tf-teal-hover)] underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Einladungslink
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--tf-text-secondary)]">
                    {formatDeDateTime(new Date(inv.invitedAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invites.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--tf-text-secondary)]">
              Noch keine Einladungen.
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Aktive Vorverkaufsstellen</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Events später nachlegen: „Events freigeben“. Freigaben entfernen über das × am Chip.
          </p>
        </div>
        {grantErr ? <p className="text-sm text-[var(--danger)]">{grantErr}</p> : null}
        {grantMsg ? <p className="text-sm text-[var(--tf-navy)]">{grantMsg}</p> : null}

        <ul className="space-y-3">
          {partners.map((p) => (
            <li key={p.userId} className="rounded-2xl border border-[var(--tf-line)] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--tf-navy)]">{p.name ?? p.email}</p>
                  {p.name ? (
                    <p className="text-xs text-[var(--tf-text-secondary)]">{p.email}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="tf-btn tf-btn-secondary text-sm"
                  onClick={() => openGrantEditor(p.userId)}
                  disabled={grantBusy}
                >
                  Events freigeben
                </button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {p.grants.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="tf-badge tf-badge-teal inline-flex max-w-full items-center gap-1.5 !px-2.5 !py-1.5 text-left text-sm"
                      onClick={() => removeGrant(p.userId, g.event.id)}
                      title="Freigabe entfernen"
                      disabled={grantBusy}
                    >
                      <span className="min-w-0 truncate">
                        {g.event.optionLabel ?? g.event.name}
                      </span>
                      <span aria-hidden>×</span>
                    </button>
                  </li>
                ))}
              </ul>

              {grantUserId === p.userId ? (
                <div className="mt-4 space-y-3 rounded-xl border border-dashed border-[var(--tf-line)] p-3">
                  <EventGrantPicker
                    events={events}
                    selectedIds={grantAddIds}
                    onChange={setGrantAddIds}
                    excludeIds={grantExcludeIds}
                    legend="Weitere Events hinzufügen"
                    hint="Nur Events, die noch nicht freigegeben sind."
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="tf-btn tf-btn-primary"
                      disabled={grantBusy || grantAddIds.length < 1}
                      onClick={() => void saveGrants()}
                    >
                      {grantBusy ? "Speichert…" : "Freigaben speichern"}
                    </button>
                    <button
                      type="button"
                      className="tf-btn tf-btn-secondary"
                      disabled={grantBusy}
                      onClick={() => {
                        setGrantUserId(null);
                        setGrantAddIds([]);
                      }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
          {partners.length === 0 ? (
            <li className="text-sm text-[var(--tf-text-secondary)]">
              Noch keine aktiven Partner-Freigaben.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="tf-card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">
            Tickets für Vorverkaufsstelle vorbereiten
          </h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Typischer Ablauf: Tickets vorabbuchen (z. B. 10–20), PDF drucken, vor Ort verkaufen und
            als verkauft markieren (gleiche Ticketnr./QR), Bargeld einnehmen, bei Bedarf nachbuchen,
            am Ende nur den Rest (noch zugewiesen) stornieren. Das Kontingent wird vom gemeinsamen
            Online-/Tageskasse-Bestand abgezogen — kein Doppelverkauf.
          </p>
          <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">
            Status: zugewiesen = vorgedruckt, noch nicht final verkauft · verkauft = Partner hat
            verkauft · Rest stornieren gibt nur zugewiesene Tickets zurück.
          </p>
          {consignments.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] px-3 py-2.5 text-sm">
              <p className="text-[var(--tf-navy)]">
                <span className="font-medium">Übersicht:</span> vorgebucht{" "}
                <strong>{consignmentSummary.allocated}</strong>
                {" · "}
                zugewiesen <strong>{consignmentSummary.remaining}</strong>
                {" · "}
                storniert <strong>{consignmentSummary.voided}</strong>
                {" · "}
                offene Vorgänge {consignmentSummary.openRows}/{consignmentSummary.rows}
              </p>
              <button
                type="button"
                className="tf-btn tf-btn-secondary text-xs"
                onClick={exportConsignmentsCsv}
              >
                CSV exportieren
              </button>
            </div>
          ) : null}
        </div>

        <form onSubmit={allocateConsignment} className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Vorverkaufsstelle</span>
            <select
              className="tf-input"
              required
              value={cPartnerId}
              onChange={(e) => setCPartnerId(e.target.value)}
            >
              <option value="">Bitte wählen…</option>
              {partners.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name ?? p.email}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Event</span>
            <select
              className="tf-input"
              required
              value={cEventId}
              onChange={(e) => {
                setCEventId(e.target.value);
                setCCategoryId("");
              }}
            >
              <option value="">Bitte wählen…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.optionLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Kategorie</span>
            <select
              className="tf-input"
              required
              value={cCategoryId}
              onChange={(e) => setCCategoryId(e.target.value)}
              disabled={!cEventId}
            >
              <option value="">Bitte wählen…</option>
              {partnerCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({(c.priceGrossCents / 100).toLocaleString("de-DE", {
                    style: "currency",
                    currency: "EUR",
                  })})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>Anzahl</span>
            <input
              type="number"
              className="tf-input"
              required
              min={1}
              max={50}
              value={cQty}
              onChange={(e) => setCQty(Number(e.target.value))}
            />
          </label>
          {cErr ? <p className="text-sm text-[var(--danger)] md:col-span-2">{cErr}</p> : null}
          {cMsg ? <p className="text-sm text-[var(--tf-navy)] md:col-span-2">{cMsg}</p> : null}
          <div className="md:col-span-2">
            <button
              type="submit"
              className="tf-btn tf-btn-primary"
              disabled={
                cBusy || !cPartnerId || !cEventId || !cCategoryId || partners.length < 1
              }
            >
              {cBusy ? "Bucht…" : "Kontingent vorabbuchen"}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl border border-[var(--tf-line)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] text-[var(--tf-text-secondary)]">
              <tr>
                <th className="px-3 py-2 font-medium">Vorgang</th>
                <th className="px-3 py-2 font-medium">Partner / Event</th>
                <th className="px-3 py-2 font-medium">Vorgebucht / Rest</th>
                <th className="px-3 py-2 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {consignments.map((row) => (
                <tr key={row.id} className="border-b border-[var(--tf-line)]/70 align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.orderNumber}</p>
                    <p className="text-xs text-[var(--tf-text-secondary)]">
                      {formatDeDateTime(new Date(row.createdAt))}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.partner.name ?? row.partner.email}</p>
                    <p className="text-xs text-[var(--tf-text-secondary)]">
                      {row.eventName} · {row.categoryName}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <p>
                      Vorgebucht: {row.allocated}
                    </p>
                    <p>
                      Zugewiesen: {row.assignedCount ?? row.activeCount}
                      {typeof row.soldCount === "number" ? ` · Verkauft: ${row.soldCount}` : ""}
                    </p>
                    {row.voidedCount > 0 ? <p>Storniert: {row.voidedCount}</p> : null}
                    <p className="text-[var(--tf-text-secondary)]">
                      {row.status === "open"
                        ? "Offen (noch zugewiesene Tickets)"
                        : row.status === "sold_out"
                          ? "Alles verkauft (kein Rest)"
                        : row.status === "cancelled"
                          ? "Abgeschlossen / Rest storniert"
                          : "Erledigt (kein Rest)"}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {(row.assignedCount ?? row.activeCount) > 0 ? (
                        <>
                          <button
                            type="button"
                            className="tf-btn tf-btn-secondary text-xs"
                            disabled={cBusy}
                            onClick={() => void printConsignment(row.id)}
                          >
                            PDF drucken
                          </button>
                          <button
                            type="button"
                            className="tf-btn tf-btn-secondary text-xs"
                            disabled={cBusy}
                            onClick={() => void cancelRemaining(row.id)}
                          >
                            Rest stornieren
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-[var(--tf-text-secondary)]">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {consignments.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--tf-text-secondary)]">
              Noch keine Kontingente gebucht.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
