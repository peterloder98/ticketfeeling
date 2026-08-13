import Link from "next/link";
import {
  canStartSales,
  hasValidEventCover,
  isSalesActivationBlocked,
  salesBlockReasonLabel,
  type CanStartSalesInput,
  type SalesBlockReason,
} from "@/lib/commerce/event-sale";
import { formatDeDateTime } from "@/lib/datetime-de";

type Props = {
  event: {
    id: string;
    status: string;
    coverImageUrl?: string | null;
    eventStartsAt?: Date | null;
    doorsOpenAt?: Date | null;
    presaleStartsAt?: Date | null;
    tour?: { coverImageUrl?: string | null; visibility?: string | null } | null;
    ticketCategories: Array<{
      priceGrossCents: number;
      capacity: number;
    }>;
  };
  /** Optional sample ticket id for preview link */
  previewTicketId?: string | null;
};

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        className={ok ? "text-[var(--tf-teal)]" : "text-[var(--tf-text-secondary)]"}
        aria-hidden
      >
        {ok ? "✓" : "✕"}
      </span>
      <span className={ok ? "text-[var(--tf-navy)]" : "text-[var(--tf-text-secondary)]"}>
        {label}
      </span>
    </li>
  );
}

export function EventSalesReadiness({ event, previewTicketId }: Props) {
  const input: CanStartSalesInput = {
    coverImageUrl: event.coverImageUrl,
    eventStartsAt: event.eventStartsAt,
    tour: event.tour,
    categories: event.ticketCategories,
  };
  const ready = canStartSales(input);
  const coverOk = hasValidEventCover(event);
  const hasCats = event.ticketCategories.length > 0;
  const hasPrices = event.ticketCategories.some((c) => c.priceGrossCents >= 0);
  const hasStart = Boolean(event.eventStartsAt);
  const hasPresale = Boolean(event.presaleStartsAt);
  const blocked = isSalesActivationBlocked({
    status: event.status,
    presaleStartsAt: event.presaleStartsAt,
    coverImageUrl: event.coverImageUrl,
    eventStartsAt: event.eventStartsAt,
    tour: event.tour,
    categories: event.ticketCategories,
  });

  return (
    <section className="tf-card space-y-4 !p-5" id="verkaufsbereitschaft">
      <div>
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Verkaufsbereitschaft</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Zwingende Voraussetzungen vor dem öffentlichen Verkauf.
        </p>
      </div>

      <ul className="space-y-1.5">
        <CheckRow ok={hasStart} label="Eventdaten / Termin" />
        <CheckRow ok={hasCats} label="Ticketkategorien vorhanden" />
        <CheckRow ok={hasPrices} label="Preise vorhanden" />
        <CheckRow ok={hasPresale} label="Verkaufsstart definiert" />
        <CheckRow ok={coverOk} label={coverOk ? "Eventcover vorhanden" : "Eventcover fehlt"} />
      </ul>

      {ready.ok ? (
        <p className="rounded-xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] px-3 py-2 text-sm font-medium text-[var(--tf-navy)]">
          ✓ Verkaufsbereit
        </p>
      ) : (
        <div className="rounded-xl border border-[rgba(214,166,66,0.45)] bg-[rgba(214,166,66,0.1)] px-3 py-2 text-sm text-[var(--tf-navy)]">
          <p className="font-medium">Das Event ist noch nicht verkaufsbereit.</p>
          <p className="mt-1 text-[var(--tf-text-secondary)]">
            {ready.reasons.map((r) => salesBlockReasonLabel(r as SalesBlockReason)).join(" · ")}
          </p>
          {!coverOk ? (
            <a href="#cover" className="tf-link mt-2 inline-block underline">
              Eventcover hochladen
            </a>
          ) : null}
        </div>
      )}

      {blocked ? (
        <div className="rounded-xl border border-[rgba(214,166,66,0.5)] bg-[rgba(214,166,66,0.12)] px-3 py-3 text-sm text-[var(--tf-navy)]">
          <p className="font-semibold">Verkaufsstart blockiert</p>
          <p className="mt-1 text-[var(--tf-text-secondary)]">
            Der geplante Verkaufsstart konnte nicht durchgeführt werden, weil Voraussetzungen
            fehlen.
          </p>
          {event.presaleStartsAt ? (
            <p className="mt-2">
              Geplanter Verkaufsstart:{" "}
              {formatDeDateTime(event.presaleStartsAt, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          ) : null}
          <p className="mt-1">
            Grund: {blocked.reasons.map((r) => salesBlockReasonLabel(r)).join(", ")}
          </p>
          {blocked.reasons.includes("MISSING_EVENT_COVER") ? (
            <a href="#cover" className="tf-btn tf-btn-primary mt-3 inline-flex !min-h-10 text-sm">
              Eventcover jetzt hochladen
            </a>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm">
        <a href="#ticketvorschau" className="tf-link underline">
          Ticketvorschau (Beispieldaten)
        </a>
        {previewTicketId ? (
          <>
            {" · "}
            <Link
              href={`/ticket/${previewTicketId}`}
              className="tf-link underline"
              target="_blank"
              rel="noreferrer"
            >
              Echtes Ticket öffnen
            </Link>
          </>
        ) : null}
      </p>
    </section>
  );
}
