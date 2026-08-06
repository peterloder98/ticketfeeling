"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function AcceptInviteForm({
  token,
  email,
  firstName,
  lastName,
  eventNames,
  kind = "box_office",
  roleName,
}: {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  eventNames?: string[];
  kind?: "box_office" | "staff";
  roleName?: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Passwort mindestens 8 Zeichen.");
      return;
    }
    if (password !== password2) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const acceptUrl =
        kind === "staff"
          ? "/api/v1/staff/invites/accept"
          : "/api/v1/box-office/invites/accept";
      const res = await fetch(acceptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.code ?? "Einrichtung fehlgeschlagen");
        return;
      }
      const login = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (login?.error) {
        router.push("/login");
        return;
      }
      const path =
        kind === "staff"
          ? (typeof data.path === "string" ? data.path : "/admin")
          : "/kasse";
      router.push(path);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const title =
    kind === "staff"
      ? roleName
        ? `Zugang als ${roleName}`
        : "Zugang einrichten"
      : "Zugang einrichten";
  const eyebrow = kind === "staff" ? "Mitarbeiter-Zugang" : "Tageskasse-Zugang";
  const cta =
    kind === "staff"
      ? busy
        ? "Richtet ein…"
        : "Zugang anlegen & starten"
      : busy
        ? "Richtet ein…"
        : "Zugang anlegen & zur Kasse";

  return (
    <form onSubmit={onSubmit} className="tf-card mx-auto max-w-md space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--tf-text-secondary)]">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--tf-navy)]">{title}</h1>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          {firstName} {lastName} · {email}
        </p>
        {kind === "box_office" ? (
          <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
            Freigegebene Events: {(eventNames ?? []).join(", ") || "—"}
          </p>
        ) : roleName ? (
          <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">Rolle: {roleName}</p>
        ) : null}
      </div>
      <label className="grid gap-1 text-sm">
        <span>Passwort</span>
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
      <label className="grid gap-1 text-sm">
        <span>Passwort wiederholen</span>
        <input
          type="password"
          className="tf-input"
          required
          minLength={8}
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button type="submit" className="tf-btn tf-btn-primary w-full" disabled={busy}>
        {cta}
      </button>
    </form>
  );
}
