"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    if (result?.error) {
      setLoading(false);
      setError("Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.");
      return;
    }
    try {
      const home = await fetch("/api/v1/auth/home");
      const data = (await home.json()) as { path?: string };
      router.push(data.path || "/admin");
    } catch {
      router.push("/admin");
    }
    router.refresh();
    setLoading(false);
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
          autoComplete="username"
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
          autoComplete="current-password"
        />
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button type="submit" className="tf-btn tf-btn-primary w-full" disabled={loading}>
        {loading ? "Anmelden…" : "Anmelden"}
      </button>
    </form>
  );
}
