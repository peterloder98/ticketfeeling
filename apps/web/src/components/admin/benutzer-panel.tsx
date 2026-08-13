"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDeDateTime } from "@/lib/datetime-de";

type RoleOpt = { key: string; name: string; description: string };

type MemberRow = {
  membershipId: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    status: string;
  };
  roles: { key: string; name: string }[];
};

type InviteRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleKey: string;
  roleName: string;
  status: string;
  invitedAt: string;
  expiresAt: string;
  acceptPath: string | null;
};

const ERROR_LABELS: Record<string, string> = {
  USER_ALREADY_MEMBER: "Diese E-Mail ist bereits Mitarbeiter:in.",
  PASSWORD_TOO_SHORT: "Passwort mindestens 8 Zeichen.",
  ROLE_MISSING: "Rolle fehlt — bitte Seite neu laden.",
  CANNOT_DISABLE_SELF: "Sie können sich nicht selbst deaktivieren.",
  BOX_OFFICE_EXCLUSIVE: "Vorverkaufsstelle nicht mit anderen Rollen kombinieren.",
  USE_BOX_OFFICE_INVITE: "Vorverkaufsstellen bitte über die Partner-Einladung anlegen.",
  INVALID_EMAIL: "Bitte eine gültige E-Mail eingeben.",
  NAME_REQUIRED: "Vor- und Nachname werden benötigt.",
  FORBIDDEN: "Keine Berechtigung.",
};

function errorLabel(code: string) {
  return ERROR_LABELS[code] ?? code;
}

export function BenutzerPanel({
  roles,
  initialMembers,
  initialInvites,
  customerCount,
  currentUserId,
}: {
  roles: RoleOpt[];
  initialMembers: MemberRow[];
  initialInvites: InviteRow[];
  customerCount: number;
  currentUserId: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [mode, setMode] = useState<"invite" | "create">("invite");
  const [roleKey, setRoleKey] = useState("organizer_admin");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("organizer_admin");
  const [resetPw, setResetPw] = useState("");

  const inviteableRoles = useMemo(
    () => roles.filter((r) => r.key === "organizer_admin" || r.key === "scanner"),
    [roles],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (roleKey === "box_office") {
      setError("Vorverkaufsstellen bitte über die Partner-Einladung anlegen.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "invite"
            ? { mode: "invite", email, firstName, lastName, roleKey }
            : { mode: "create", email, firstName, lastName, roleKey, password },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(errorLabel(data?.error?.code ?? "Fehler"));
        return;
      }
      if (mode === "invite") {
        setOk(
          `Einladung an ${email} gesendet.${
            data.invite?.acceptPath
              ? ` Link: ${typeof window !== "undefined" ? window.location.origin : ""}${data.invite.acceptPath}`
              : ""
          }`,
        );
        setInvites((prev) => [
          {
            id: data.invite.id,
            email,
            firstName,
            lastName,
            roleKey,
            roleName: roles.find((r) => r.key === roleKey)?.name ?? roleKey,
            status: data.invite.status,
            invitedAt: new Date().toISOString(),
            expiresAt: data.invite.expiresAt,
            acceptPath: data.invite.acceptPath,
          },
          ...prev,
        ]);
      } else {
        setOk(`Konto für ${email} angelegt.`);
      }
      setEmail("");
      setFirstName("");
      setLastName("");
      setPassword("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(
    userId: string,
    body: Record<string, unknown>,
    successMsg: string,
  ) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(errorLabel(data?.error?.code ?? "Fehler"));
        return;
      }
      setOk(successMsg);
      if (body.action === "set_status") {
        setMembers((prev) =>
          prev.map((m) =>
            m.user.id === userId
              ? {
                  ...m,
                  status: String(body.status),
                  user: { ...m.user, status: String(body.status) },
                }
              : m,
          ),
        );
      }
      if (body.action === "set_roles") {
        const keys = body.roleKeys as string[];
        setMembers((prev) =>
          prev.map((m) =>
            m.user.id === userId
              ? {
                  ...m,
                  roles: keys.map((key) => ({
                    key,
                    name: roles.find((r) => r.key === key)?.name ?? key,
                  })),
                }
              : m,
          ),
        );
        setEditUserId(null);
      }
      if (body.action === "reset_password") {
        setResetPw("");
        setEditUserId(null);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/partner"
          className="tf-card block transition hover:ring-1 hover:ring-[var(--tf-teal)]/40"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
            Vorverkauf
          </p>
          <p className="mt-1 text-lg font-semibold text-[var(--tf-navy)]">
            Vorverkaufsstellen einladen
          </p>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Bestehender Flow mit Event-Freigaben — nur Tageskasse.
          </p>
        </Link>
        <Link
          href="/admin/kunden"
          className="tf-card block transition hover:ring-1 hover:ring-[var(--tf-teal)]/40"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--tf-teal)]">
            Käufer
          </p>
          <p className="mt-1 text-lg font-semibold text-[var(--tf-navy)]">
            Kunden verwalten
          </p>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            {customerCount} Kund:innen · Konten aus Checkout, kein Staff-Zugang.
          </p>
        </Link>
      </div>

      <form onSubmit={onCreate} className="tf-card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Mitarbeiter:in anlegen</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Administrator oder Scanner per Einladung (Passwort selbst setzen) oder direkt mit
            Passwort. Vorverkaufsstellen weiterhin über den Partner-Link oben.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`tf-btn ${mode === "invite" ? "tf-btn-primary" : "tf-btn-secondary"}`}
            onClick={() => setMode("invite")}
          >
            Per E-Mail einladen
          </button>
          <button
            type="button"
            className={`tf-btn ${mode === "create" ? "tf-btn-primary" : "tf-btn-secondary"}`}
            onClick={() => setMode("create")}
          >
            Sofort anlegen
          </button>
        </div>

        <label className="grid gap-1 text-sm">
          <span>Rolle</span>
          <select
            className="tf-input"
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
          >
            {inviteableRoles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} — {r.description}
              </option>
            ))}
          </select>
        </label>

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

        {mode === "create" ? (
          <label className="grid gap-1 text-sm">
            <span>Start-Passwort</span>
            <input
              type="password"
              className="tf-input"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        ) : null}

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {ok ? <p className="text-sm text-[var(--tf-navy)]">{ok}</p> : null}

        <button type="submit" className="tf-btn tf-btn-primary" disabled={busy}>
          {busy
            ? "Speichert…"
            : mode === "invite"
              ? "Einladung senden"
              : "Konto anlegen"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Team</h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--tf-line)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] text-[var(--tf-text-secondary)]">
              <tr>
                <th className="px-3 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Rollen</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const editing = editUserId === m.user.id;
                const isSelf = m.user.id === currentUserId;
                return (
                  <tr key={m.membershipId} className="border-b border-[var(--tf-line)]/70 align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium text-[var(--tf-navy)]">
                        {m.user.name ?? "Ohne Name"}
                        {isSelf ? (
                          <span className="ml-2 text-xs font-normal text-[var(--tf-text-secondary)]">
                            (Sie)
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-[var(--tf-text-secondary)]">{m.user.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      {m.roles.map((r) => r.name).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          m.status === "active"
                            ? "font-medium text-[var(--tf-teal-hover)]"
                            : "text-[var(--tf-text-secondary)]"
                        }
                      >
                        {m.status === "active" ? "Aktiv" : "Deaktiviert"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="tf-btn tf-btn-secondary !px-3 !py-1.5 text-xs"
                          disabled={busy}
                          onClick={() => {
                            setEditUserId(editing ? null : m.user.id);
                            setEditRole(m.roles[0]?.key ?? "organizer_admin");
                            setResetPw("");
                          }}
                        >
                          {editing ? "Schließen" : "Bearbeiten"}
                        </button>
                        {!isSelf ? (
                          <button
                            type="button"
                            className="tf-btn tf-btn-secondary !px-3 !py-1.5 text-xs"
                            disabled={busy}
                            onClick={() =>
                              patchUser(
                                m.user.id,
                                {
                                  action: "set_status",
                                  status: m.status === "active" ? "disabled" : "active",
                                },
                                m.status === "active"
                                  ? "Zugang deaktiviert."
                                  : "Zugang wieder aktiv.",
                              )
                            }
                          >
                            {m.status === "active" ? "Deaktivieren" : "Aktivieren"}
                          </button>
                        ) : null}
                      </div>
                      {editing ? (
                        <div className="mt-3 space-y-3 rounded-xl border border-[var(--tf-line)] bg-white p-3">
                          <label className="grid gap-1 text-xs">
                            <span>Rolle ändern</span>
                            <select
                              className="tf-input"
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                            >
                              {roles.map((r) => (
                                <option key={r.key} value={r.key}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="tf-btn tf-btn-primary !px-3 !py-1.5 text-xs"
                            disabled={busy || editRole === "box_office"}
                            onClick={() =>
                              patchUser(
                                m.user.id,
                                { action: "set_roles", roleKeys: [editRole] },
                                "Rolle aktualisiert.",
                              )
                            }
                          >
                            Rolle speichern
                          </button>
                          {editRole === "box_office" ? (
                            <p className="text-xs text-[var(--tf-text-secondary)]">
                              Vorverkaufsrolle bitte über{" "}
                              <Link href="/admin/partner" className="text-[var(--tf-teal)] underline">
                                Vorverkaufsstellen
                              </Link>{" "}
                              mit Event-Freigaben einrichten.
                            </p>
                          ) : null}
                          <label className="grid gap-1 text-xs">
                            <span>Neues Passwort setzen</span>
                            <input
                              type="password"
                              className="tf-input"
                              minLength={8}
                              value={resetPw}
                              onChange={(e) => setResetPw(e.target.value)}
                              autoComplete="new-password"
                            />
                          </label>
                          <button
                            type="button"
                            className="tf-btn tf-btn-secondary !px-3 !py-1.5 text-xs"
                            disabled={busy || resetPw.length < 8}
                            onClick={() =>
                              patchUser(
                                m.user.id,
                                { action: "reset_password", password: resetPw },
                                "Passwort aktualisiert.",
                              )
                            }
                          >
                            Passwort speichern
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {members.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--tf-text-secondary)]">
              Noch keine Mitarbeiter:innen.
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Offene Einladungen</h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--tf-line)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] text-[var(--tf-text-secondary)]">
              <tr>
                <th className="px-3 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Rolle</th>
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
                  <td className="px-3 py-2">{inv.roleName}</td>
                  <td className="px-3 py-2">
                    <p>{inv.status}</p>
                    {inv.status === "pending" && inv.acceptPath ? (
                      <a
                        href={inv.acceptPath}
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
              Keine offenen Staff-Einladungen.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
