/** Highly visible public notice after a live event’s schedule was changed. */
export function ScheduleChangedBanner({
  compact = false,
}: {
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div
        className="rounded-lg border border-[rgba(185,28,28,0.45)] bg-[rgba(185,28,28,0.1)] px-2.5 py-2 text-xs font-semibold text-[var(--tf-navy)]"
        role="status"
      >
        Achtung: geänderter Termin — bitte Datum und Uhrzeit prüfen.
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border-2 border-[rgba(185,28,28,0.5)] bg-[rgba(185,28,28,0.1)] px-4 py-3 shadow-sm"
      role="status"
    >
      <p className="text-sm font-bold tracking-tight text-[var(--tf-navy)] md:text-base">
        Achtung, geänderter Termin
      </p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--tf-navy)]/85">
        Beginn, Einlass oder Ende wurden angepasst. Bitte prüfe Datum und Uhrzeit
        sorgfältig — deine Tickets gelten für den neuen Termin.
      </p>
    </div>
  );
}
