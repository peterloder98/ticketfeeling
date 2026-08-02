"use client";

import { useActionState } from "react";
import {
  testDefaultEmailAccountAction,
  type SmtpTestState,
} from "@/app/admin/einstellungen/email/actions";

const initial: SmtpTestState = { ok: null, message: "" };

export function DefaultSmtpTestPanel({
  defaultLabel,
  defaultFrom,
}: {
  defaultLabel: string | null;
  defaultFrom: string | null;
}) {
  const [state, action, pending] = useActionState(testDefaultEmailAccountAction, initial);

  return (
    <div className="tf-card space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">SMTP prüfen</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Prüft Login und Verbindung des Standard-Kontos
          {defaultLabel ? (
            <>
              {" "}
              (<strong>{defaultLabel}</strong>
              {defaultFrom ? ` · ${defaultFrom}` : ""})
            </>
          ) : (
            " (noch keines gesetzt)"
          )}
          .
        </p>
      </div>
      <form action={action}>
        <button
          type="submit"
          className="tf-btn tf-btn-primary"
          disabled={pending || !defaultLabel}
        >
          {pending ? "Prüfe…" : "Daten prüfen"}
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
    </div>
  );
}
