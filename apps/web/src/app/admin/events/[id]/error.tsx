"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AdminEventDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/events/[id]]", error);
  }, [error]);

  return (
    <div className="tf-card space-y-4 !p-6">
      <h1 className="text-2xl font-semibold text-[var(--tf-navy)]">
        Event konnte nicht geladen werden
      </h1>
      <p className="text-sm text-[var(--tf-text-secondary)]">
        Beim Öffnen ist etwas schiefgelaufen — oft sind Entwurfsdaten noch unvollständig oder die
        Datenbank braucht einen Moment. Bitte erneut versuchen.
      </p>
      {error.digest ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">Referenz: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="tf-btn tf-btn-primary !min-h-10 text-sm" onClick={reset}>
          Erneut versuchen
        </button>
        <Link href="/admin/events" className="tf-btn tf-btn-secondary !min-h-10 text-sm">
          Zurück zur Event-Liste
        </Link>
      </div>
    </div>
  );
}
