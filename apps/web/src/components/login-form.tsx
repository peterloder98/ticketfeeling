"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@ticketfeeling.local");
  const [password, setPassword] = useState("TicketfeelingAdmin!2026");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="tf-card space-y-4">
      <div>
        <label className="tf-label" htmlFor="email">
          E-Mail
        </label>
        <input
          id="email"
          type="email"
          required
          className="tf-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label className="tf-label" htmlFor="password">
          Passwort
        </label>
        <input
          id="password"
          type="password"
          required
          className="tf-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button type="submit" className="tf-btn tf-btn-primary w-full" disabled={loading}>
        {loading ? "Anmelden…" : "Anmelden"}
      </button>
    </form>
  );
}
