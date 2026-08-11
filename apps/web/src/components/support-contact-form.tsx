"use client";

import { FormEvent, useState } from "react";

export function SupportContactForm() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/v1/support/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subject, body }),
      });
      if (response.ok) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-xl border border-[var(--tf-line)] bg-[rgba(20,184,166,0.08)] px-4 py-3 text-sm font-medium text-[var(--tf-navy)]">
        Geschafft — deine Anfrage ist angekommen. Wir melden uns per E-Mail.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="tf-label" htmlFor="support-email">
          E-Mail
        </label>
        <input
          id="support-email"
          type="email"
          required
          className="tf-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="tf-label" htmlFor="support-subject">
          Betreff
        </label>
        <input
          id="support-subject"
          required
          className="tf-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div>
        <label className="tf-label" htmlFor="support-body">
          Nachricht
        </label>
        <textarea
          id="support-body"
          required
          rows={4}
          className="tf-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <button type="submit" className="tf-btn tf-btn-primary" disabled={loading}>
        {loading ? "Senden…" : "Anfrage senden"}
      </button>
    </form>
  );
}
