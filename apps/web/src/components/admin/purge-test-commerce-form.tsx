"use client";

import { useActionState, useState } from "react";
import {
  purgeTestCommerceAction,
  type PurgeTestCommerceState,
} from "@/app/admin/system/aufraeumen/actions";

/** Must match `PURGE_CONFIRM_PHRASE` in lib/admin/purge-test-commerce.ts */
const CONFIRM_PHRASE = "AUFRÄUMEN";

const initial: PurgeTestCommerceState = { ok: null, message: "" };

export function PurgeTestCommerceForm() {
  const [state, action, pending] = useActionState(purgeTestCommerceAction, initial);
  const [phrase, setPhrase] = useState("");
  const confirmed = phrase.trim() === CONFIRM_PHRASE;

  return (
    <section className="tf-card space-y-4 border-[rgba(220,38,38,0.28)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--danger)]">
          Gefahrenzone
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[var(--danger)]">
          Testdaten aufräumen
        </h2>
        <p className="mt-2 text-sm text-[var(--tf-text-secondary)]">
          Läuft auf dem Server mit der Produktions-Datenbank (Vercel{" "}
          <code className="text-[var(--tf-navy)]">DATABASE_URL</code>
          ). Du brauchst dafür keinen Neon-Login und keine lokale Env-Datei.
        </p>
      </div>

      <div className="rounded-xl border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.05)] px-4 py-3 text-sm text-[var(--tf-navy)]">
        <p className="font-semibold">Was gelöscht wird</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--tf-text-secondary)]">
          <li>Alle Bestellungen und Tickets der Organisation</li>
          <li>
            Alle Events außer der Tour „SCHLAGERfeeling Weihnachtstraum“ und „Schlagernacht der
            Herzen“
          </li>
          <li>Leere Touren (außer Weihnachtstraum)</li>
          <li>Terminänderungs-Hinweis bei Löwenberg (falls gesetzt)</li>
        </ul>
        <p className="mt-3 text-[var(--tf-text-secondary)]">
          Das lässt sich nicht rückgängig machen. Nur für Administratoren.
        </p>
      </div>

      <form action={action} className="space-y-3">
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--tf-text-secondary)]">
            Zur Bestätigung „{CONFIRM_PHRASE}“ eingeben
          </span>
          <input
            name="confirmPhrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            required
            className="tf-input"
            autoComplete="off"
            spellCheck={false}
            placeholder={CONFIRM_PHRASE}
            disabled={pending}
          />
        </label>
        <button
          type="submit"
          className="tf-btn !py-2 text-sm text-[var(--danger)] border-[rgba(220,38,38,0.35)] disabled:opacity-50"
          disabled={pending || !confirmed}
        >
          {pending ? "Räume auf…" : "Jetzt aufräumen"}
        </button>
      </form>

      {state.message ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            state.ok
              ? "bg-[rgba(34,197,94,0.12)] text-[#15803d]"
              : "bg-[rgba(239,68,68,0.1)] text-[#b91c1c]"
          }`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      {state.ok && state.result ? (
        <ul className="space-y-1 text-sm text-[var(--tf-text-secondary)]">
          <li>Bestellungen entfernt: {state.result.ordersDeleted}</li>
          <li>Events entfernt: {state.result.eventsDeleted}</li>
          <li>Events behalten: {state.result.eventsKept.join(", ") || "(keine)"}</li>
          <li>Leere Touren entfernt: {state.result.emptyToursDeleted}</li>
          <li>
            Löwenberg-Hinweis:{" "}
            {state.result.loewenbergScheduleCleared ? "gelöscht" : "war schon leer / fehlt"}
          </li>
        </ul>
      ) : null}
    </section>
  );
}
