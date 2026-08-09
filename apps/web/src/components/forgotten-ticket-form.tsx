"use client";

import { FormEvent, useState } from "react";

export function ForgottenTicketForm() {
  const [email, setEmail] = useState("");
  const [orderNumberHint, setOrderNumberHint] = useState("");
  const [lastName, setLastName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setFormError(null);

    const orderTrimmed = orderNumberHint.trim();
    const lastTrimmed = lastName.trim();
    if (!orderTrimmed && !lastTrimmed) {
      setFormError(
        "Bitte Bestellnummer oder Nachname angeben — so stellen wir sicher, dass nur du an deine Tickets kommst.",
      );
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/v1/support/forgotten-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          orderNumberHint: orderTrimmed || undefined,
          lastName: lastTrimmed || undefined,
        }),
      });
      const data = await response.json();
      setMessage(
        data.message ??
          "Falls deine Angaben zu einer bezahlten Bestellung passen, senden wir dir in Kürze einen sicheren Link.",
      );
    } catch {
      setMessage(
        "Falls deine Angaben zu einer bezahlten Bestellung passen, senden wir dir in Kürze einen sicheren Link.",
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
          autoComplete="email"
          className="tf-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label className="tf-label" htmlFor="order">
          Bestellnummer
        </label>
        <input
          id="order"
          className="tf-input"
          autoComplete="off"
          placeholder="z. B. TF-B-2026-…"
          value={orderNumberHint}
          onChange={(event) => {
            setOrderNumberHint(event.target.value);
            if (formError) setFormError(null);
          }}
        />
        <p className="mt-1.5 text-xs text-[var(--tf-text-secondary)]">
          Steht in deiner Bestätigungsmail — am sichersten zusammen mit dem Nachnamen.
        </p>
      </div>
      <div>
        <label className="tf-label" htmlFor="lastName">
          Nachname
        </label>
        <input
          id="lastName"
          className="tf-input"
          autoComplete="family-name"
          value={lastName}
          onChange={(event) => {
            setLastName(event.target.value);
            if (formError) setFormError(null);
          }}
        />
        <p className="mt-1.5 text-xs text-[var(--tf-text-secondary)]">
          Wie bei der Bestellung. Reicht auch ohne Bestellnummer, wenn du sie nicht mehr hast.
        </p>
      </div>
      {formError ? (
        <p className="text-sm text-[var(--tf-sale)]" role="alert">
          {formError}
        </p>
      ) : null}
      <button type="submit" className="tf-btn tf-btn-primary" disabled={loading}>
        {loading ? "Wird geprüft…" : "Sicheren Link anfordern"}
      </button>
      {message ? <p className="text-sm text-[var(--tf-text-secondary)]">{message}</p> : null}
      <p className="text-xs text-[var(--tf-text-secondary)]">
        Mindestens Bestellnummer oder Nachname ist nötig. Aus Sicherheitsgründen teilen wir
        nicht mit, ob eine Bestellung bekannt ist. Der Link ist nur kurz gültig und einmalig
        nutzbar.
      </p>
    </form>
  );
}
