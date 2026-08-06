"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Check, MapPin } from "lucide-react";

type EventOption = {
  id: string;
  name: string;
  whenLabel: string | null;
  locationLabel: string | null;
  /** Precomputed disambiguated label for tables / compact lists */
  optionLabel: string;
};

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

export function PartnerInvitePanel({
  events,
  initialInvites,
  initialGrants,
}: {
  events: EventOption[];
  initialInvites: InviteRow[];
  initialGrants: GrantRow[];
}) {
  const router = useRouter();
  const [invites, setInvites] = useState(initialInvites);
  const [grants] = useState(initialGrants);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function toggleEvent(id: string) {
    setEventIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
        setError(data?.error?.code ?? "Einladung fehlgeschlagen");
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
          token: typeof data.invite.acceptPath === "string"
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
            kein Admin-Menü.
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

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-[var(--tf-navy)]">
            Freigabe für die Tageskasse
          </legend>
          <p className="mb-3 text-sm text-[var(--tf-text-secondary)]">
            Tippe die Events an, die diese Vorverkaufsstelle verkaufen darf. Gleichnamige
            Termine erkennst du an Datum und Ort.
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
            {events.map((ev) => {
              const selected = eventIds.includes(ev.id);
              return (
                <button
                  key={ev.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleEvent(ev.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition duration-200 ${
                    selected
                      ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)] ring-2 ring-[rgba(20,184,166,0.22)]"
                      : "border-[var(--tf-line)] bg-white hover:border-[var(--tf-teal)]"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      selected
                        ? "border-[var(--tf-teal)] bg-[var(--tf-teal)] text-white"
                        : "border-[var(--tf-line)] bg-white text-transparent"
                    }`}
                    aria-hidden
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[var(--tf-navy)]">{ev.name}</span>
                    {ev.whenLabel ? (
                      <span className="mt-1 flex items-start gap-1.5 text-sm text-[var(--tf-text-secondary)]">
                        <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                        {ev.whenLabel}
                      </span>
                    ) : null}
                    {ev.locationLabel ? (
                      <span className="mt-0.5 flex items-start gap-1.5 text-sm text-[var(--tf-text-secondary)]">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--tf-teal)]" />
                        {ev.locationLabel}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            {events.length === 0 ? (
              <p className="text-sm text-[var(--tf-text-secondary)]">Keine Events verfügbar.</p>
            ) : null}
          </div>
          {eventIds.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">
              {eventIds.length} Event{eventIds.length === 1 ? "" : "s"} ausgewählt
            </p>
          ) : null}
        </fieldset>

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
                    {inv.events
                      .map((e) => e.event.optionLabel ?? e.event.name)
                      .join(", ") || "—"}
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
                    {new Date(inv.invitedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
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
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Aktive Freigaben</h2>
        <ul className="space-y-2 text-sm">
          {grants.map((g) => (
            <li key={g.id} className="rounded-xl border border-[var(--tf-line)] px-3 py-2">
              <span className="font-medium">{g.user.name ?? g.user.email}</span>
              <span className="text-[var(--tf-text-secondary)]">
                {" "}
                · {g.event.optionLabel ?? g.event.name}
              </span>
            </li>
          ))}
          {grants.length === 0 ? (
            <li className="text-[var(--tf-text-secondary)]">Noch keine aktiven Partner-Freigaben.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
