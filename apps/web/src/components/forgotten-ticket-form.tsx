"use client";

import { FormEvent, useState } from "react";

export function ForgottenTicketForm() {
  const [email, setEmail] = useState("");
  const [orderNumberHint, setOrderNumberHint] = useState("");
  const [lastName, setLastName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/support/forgotten-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          orderNumberHint: orderNumberHint || undefined,
          lastName: lastName || undefined,
        }),
      });
      const data = await response.json();
      setMessage(
        data.message ??
          "Falls zu dieser E-Mail-Adresse eine passende bezahlte Bestellung existiert, senden wir dir in Kürze einen sicheren Link.",
      );
    } catch {
      setMessage(
        "Falls zu dieser E-Mail-Adresse eine passende bezahlte Bestellung existiert, senden wir dir in Kürze einen sicheren Link.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="tf-card space-y-4">
      <div>
        <label className="tf-label" htmlFor="email">
          E-Mail-Adresse der Bestellung
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
        <label className="tf-label" htmlFor="order">
          Bestellnummer (optional)
        </label>
        <input
          id="order"
          className="tf-input"
          value={orderNumberHint}
          onChange={(event) => setOrderNumberHint(event.target.value)}
        />
      </div>
      <div>
        <label className="tf-label" htmlFor="lastName">
          Nachname (optional)
        </label>
        <input
          id="lastName"
          className="tf-input"
          autoComplete="family-name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
      </div>
      <button type="submit" className="tf-btn tf-btn-primary" disabled={loading}>
        {loading ? "Wird geprüft…" : "Sicheren Link anfordern"}
      </button>
      {message ? <p className="text-sm text-[var(--tf-text-secondary)]">{message}</p> : null}
      <p className="text-xs text-[var(--tf-text-secondary)]">
        Aus Sicherheitsgründen teilen wir nicht mit, ob eine Bestellung bekannt ist. Der Link ist
        nur kurz gültig und einmalig nutzbar.
      </p>
    </form>
  );
}
