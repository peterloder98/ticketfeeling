"use client";

import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  deleteOrCancelEventAction,
  pauseEventSalesAction,
  resumeEventSalesAction,
} from "@/app/admin/events/actions";
import { recalledEventListHref } from "@/lib/admin/event-list-filters";

type EventSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  locationName: string | null;
  locationCity: string | null;
  whenLabel: string;
};

type ConfirmKind = "danger" | "pause";

export function EventAdminHeaderActions({
  event,
  statusLabel,
  canWrite,
  ticketsSold,
  meta,
}: {
  event: EventSummary;
  statusLabel: string;
  canWrite: boolean;
  ticketsSold: number;
  meta?: ReactNode;
}) {
  const router = useRouter();
  const dialogTitleId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>("danger");
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);

  const isPaused = event.status === "paused";
  const canPause = event.status === "presale_active" || event.status === "published";
  const isCancelMode = ticketsSold > 0;
  const dangerLabel = isCancelMode ? "Event absagen" : "Event löschen";
  const dangerVerb = isCancelMode ? "absagen" : "löschen";

  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setConfirmOpen(false);
        setConfirmStep(1);
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [confirmOpen]);

  function openDangerConfirm() {
    setError(null);
    setConfirmKind("danger");
    setConfirmStep(1);
    setConfirmOpen(true);
  }

  function openPauseConfirm() {
    setError(null);
    setConfirmKind("pause");
    setConfirmStep(1);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (pending) return;
    setConfirmOpen(false);
    setConfirmStep(1);
  }

  function onResume() {
    setError(null);
    startTransition(async () => {
      const result = await resumeEventSalesAction(event.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onConfirmPause() {
    setError(null);
    startTransition(async () => {
      const result = await pauseEventSalesAction(event.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    });
  }

  function onConfirmDanger() {
    setError(null);
    startTransition(async () => {
      const result = await deleteOrCancelEventAction(event.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      if (result.mode === "deleted") {
        router.push(recalledEventListHref());
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--tf-navy)]">
          {event.name}
        </h1>
        <span className="rounded-full bg-[rgba(15,39,71,0.06)] px-2.5 py-0.5 text-xs font-medium text-[var(--tf-navy)]">
          {statusLabel}
        </span>
        <a
          href={`/event/${event.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--tf-navy)] transition-colors duration-200 hover:bg-[rgba(20,184,166,0.12)] hover:text-[var(--tf-teal)]"
          title="Öffentliche Seite öffnen"
          aria-label="Öffentliche Seite öffnen"
        >
          <ExternalLink className="h-4 w-4" strokeWidth={2} />
        </a>
      </div>

      {meta}

      {canWrite ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {canPause || isPaused ? (
            <button
              type="button"
              className={
                isPaused
                  ? "tf-btn tf-btn-primary !min-h-10 text-sm"
                  : "tf-btn tf-btn-secondary !min-h-10 text-sm"
              }
              disabled={pending}
              onClick={isPaused ? onResume : openPauseConfirm}
            >
              {pending
                ? "Einen Moment…"
                : isPaused
                  ? "Verkauf fortsetzen"
                  : "Verkauf pausieren"}
            </button>
          ) : null}
          {event.status !== "cancelled" ? (
            <button
              type="button"
              className="tf-btn tf-btn-secondary !min-h-10 border-[rgba(185,28,28,0.35)] text-sm text-[var(--danger)] hover:border-[var(--danger)]"
              disabled={pending}
              onClick={openDangerConfirm}
            >
              {dangerLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {error && !confirmOpen ? (
        <p className="mt-3 rounded-xl border border-[rgba(185,28,28,0.35)] bg-[rgba(185,28,28,0.06)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {isPaused ? (
        <p className="mt-3 rounded-xl border border-[rgba(214,166,66,0.45)] bg-[rgba(214,166,66,0.12)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          Verkauf pausiert — das Event erscheint nicht auf Startseite, Events-Liste oder
          Embeds. Mit „Verkauf fortsetzen“ geht’s weiter wie zuvor.
        </p>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,39,71,0.45)] p-4"
          role="presentation"
          onClick={closeConfirm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="relative w-full max-w-md rounded-2xl border border-[var(--tf-line)] bg-white p-5 shadow-[0_20px_50px_rgba(15,39,71,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmKind === "pause" ? (
              <>
                <h2 id={dialogTitleId} className="text-lg font-semibold text-[var(--tf-navy)]">
                  Verkauf wirklich pausieren?
                </h2>
                <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">
                  Der Online-Verkauf wird gestoppt. Das Event verschwindet von Startseite,
                  Events-Liste und Embeds — bis du den Verkauf fortsetzt.
                </p>
                {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                    disabled={pending}
                    onClick={closeConfirm}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    className="tf-btn tf-btn-primary !min-h-10 text-sm"
                    disabled={pending}
                    onClick={onConfirmPause}
                  >
                    {pending ? "Einen Moment…" : "Verkauf pausieren"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id={dialogTitleId} className="text-lg font-semibold text-[var(--tf-navy)]">
                  {confirmStep === 1
                    ? isCancelMode
                      ? "Event wirklich absagen?"
                      : "Event wirklich löschen?"
                    : isCancelMode
                      ? "Letzte Bestätigung: absagen"
                      : "Letzte Bestätigung: löschen"}
                </h2>

                <dl className="mt-4 space-y-2 rounded-xl border border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] px-3 py-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                      Name
                    </dt>
                    <dd className="font-medium text-[var(--tf-navy)]">{event.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                      Location
                    </dt>
                    <dd className="font-medium text-[var(--tf-navy)]">
                      {event.locationName ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                      Ort
                    </dt>
                    <dd className="font-medium text-[var(--tf-navy)]">
                      {event.locationCity ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.12em] text-[var(--tf-text-secondary)]">
                      Datum
                    </dt>
                    <dd className="font-medium text-[var(--tf-navy)]">{event.whenLabel}</dd>
                  </div>
                </dl>

                <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">
                  {confirmStep === 1
                    ? isCancelMode
                      ? `Es wurden bereits ${ticketsSold} Tickets verkauft. Das Event wird abgesagt — Daten und Tickets bleiben erhalten, Kauf ist nicht mehr möglich.`
                      : "Es wurden noch keine Tickets verkauft. Das Event wird unwiderruflich gelöscht — inklusive Kategorien und Saalplan-Zuordnung."
                    : isCancelMode
                      ? "Bitte bestätige noch einmal: Das Event wird öffentlich als abgesagt angezeigt."
                      : "Bitte bestätige noch einmal: Das Event wird vollständig gelöscht und kann nicht wiederhergestellt werden."}
                </p>

                {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                    disabled={pending}
                    onClick={closeConfirm}
                  >
                    Abbrechen
                  </button>
                  {confirmStep === 1 ? (
                    <button
                      type="button"
                      className="tf-btn tf-btn-primary !min-h-10 text-sm"
                      disabled={pending}
                      onClick={() => setConfirmStep(2)}
                    >
                      Ja, weiter
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tf-btn tf-btn-primary !min-h-10 bg-[var(--danger)] text-sm hover:opacity-90"
                      disabled={pending}
                      onClick={onConfirmDanger}
                    >
                      {pending
                        ? "Einen Moment…"
                        : isCancelMode
                          ? "Endgültig absagen"
                          : "Endgültig löschen"}
                    </button>
                  )}
                </div>
                <p className="sr-only">Aktion: Event {dangerVerb}</p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
