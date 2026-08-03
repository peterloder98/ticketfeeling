"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronDown, Mail, Send } from "lucide-react";
import { TicketQrImage } from "@/components/ticket-qr-image";
import { TicketResendButton } from "@/components/ticket-resend-button";

export type OrderTicketView = {
  id: string;
  ticketNumber: string;
  categorySnapshot: string;
  seatLabel: string | null;
  presence: string;
  qrToken: string | null;
  holderLabel: string | null;
  holderFirstName: string | null;
  holderLastName: string | null;
  holderEmail: string | null;
  /** Handed over to someone other than the buyer */
  transferred: boolean;
  /** Current viewer may show QR / download PDF */
  canUseEntry: boolean;
};

export type OrderPositionView = {
  id: string;
  quantity: number;
  categorySnapshot: string;
  eventNameSnapshot: string;
  whenLabel: string | null;
  placeLabel: string | null;
  tickets: OrderTicketView[];
};

type HolderSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
};

function presenceLabel(presence: string) {
  switch (presence) {
    case "in":
      return "Eingecheckt";
    case "out":
      return "Ausgecheckt";
    default:
      return "Noch nicht eingecheckt";
  }
}

function forwardErrorLabel(code: string) {
  switch (code) {
    case "VALIDATION":
    case "NAME_REQUIRED":
      return "Bitte Vor- und Nachname ausfüllen.";
    case "EMAIL_INVALID":
      return "Bitte eine gültige E-Mail-Adresse eingeben.";
    case "FORWARD_LIMIT":
      return "Zu viele Weiterleitungen heute — bitte später erneut versuchen.";
    case "FORWARD_RECIPIENT_LOCKED":
      return "Bereits weitergeleitet — nur noch an dieselbe Person erneut senden.";
    case "UNAUTHORIZED":
      return "Bitte melde dich an, um Tickets weiterzuleiten.";
    case "FORBIDDEN":
      return "Keine Berechtigung für dieses Ticket.";
    default:
      return code || "Weiterleitung fehlgeschlagen";
  }
}

function TicketForwardForm({
  ticketId,
  lockedRecipient,
  onDone,
}: {
  ticketId: string;
  /** When set, only resend to this person (no new recipient). */
  lockedRecipient: HolderSnapshot | null;
  onDone: (holder: HolderSnapshot) => void;
}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(lockedRecipient?.firstName ?? "");
  const [lastName, setLastName] = useState(lockedRecipient?.lastName ?? "");
  const [email, setEmail] = useState(lockedRecipient?.email ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const locked = Boolean(lockedRecipient?.email);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const payload = locked && lockedRecipient
      ? lockedRecipient
      : { firstName, lastName, email };
    try {
      const res = await fetch(`/api/v1/account/tickets/${ticketId}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(forwardErrorLabel(String(data?.error?.code ?? "")));
        return;
      }
      setOk(data.note ?? "Gesendet.");
      onDone(data.holder);
      setOpen(false);
      if (!locked) {
        setFirstName("");
        setLastName("");
        setEmail("");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    const label = lockedRecipient
      ? `Erneut an ${lockedRecipient.firstName} ${lockedRecipient.lastName} senden`
      : "An andere Person weiterleiten";
    return (
      <div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--tf-teal-hover)] underline-offset-2 hover:underline"
          onClick={() => setOpen(true)}
        >
          <Send className="h-3.5 w-3.5" />
          {label}
        </button>
        {ok ? <p className="mt-1 text-xs text-[var(--tf-teal-hover)]">{ok}</p> : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mt-1 space-y-3 rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-3"
    >
      <div className="flex items-start gap-2">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tf-navy)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--tf-navy)]">
            {locked ? "Erneut senden" : "Ticket weiterleiten"}
          </p>
          <p className="text-xs text-[var(--tf-text-secondary)]">
            {locked
              ? "Das Ticket geht nochmal an dieselbe gespeicherte Person — Empfänger kann nicht geändert werden."
              : "Die Person erhält eine E-Mail mit PDF und wird als Ticketinhaber eingetragen."}
          </p>
        </div>
      </div>

      {locked && lockedRecipient ? (
        <div className="rounded-lg border border-[var(--tf-line)] bg-white px-3 py-2.5 text-sm">
          <p className="font-medium text-[var(--tf-navy)]">
            {lockedRecipient.firstName} {lockedRecipient.lastName}
          </p>
          <p className="text-xs text-[var(--tf-text-secondary)]">{lockedRecipient.email}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--tf-navy)]">Vorname</span>
              <input
                className="tf-input !min-h-10 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoComplete="given-name"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-[var(--tf-navy)]">Nachname</span>
              <input
                className="tf-input !min-h-10 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                autoComplete="family-name"
              />
            </label>
          </div>
          <label className="grid gap-1 text-xs">
            <span className="font-medium text-[var(--tf-navy)]">E-Mail-Adresse</span>
            <input
              type="email"
              className="tf-input !min-h-10 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <p className="rounded-lg bg-white px-2.5 py-2 text-[11px] leading-relaxed text-[var(--tf-text-secondary)]">
            Vorlage: „Hallo [Vorname], [dein Name] hat ein Ticket für dich weitergeleitet …“ inkl.
            Event, Termin und PDF-Anhang.
          </p>
        </>
      )}

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="tf-btn tf-btn-primary !min-h-10 text-sm" disabled={loading}>
          {loading ? "Sende…" : locked ? "Erneut senden" : "Ticket senden"}
        </button>
        <button
          type="button"
          className="tf-btn tf-btn-secondary !min-h-10 text-sm"
          disabled={loading}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function OrderTicketsPanel({
  positions,
  canForward,
  /** e.g. "/embed/ticket" to stay inside the iframe shop */
  ticketPathPrefix = "/ticket",
  /** Guest order access token — appended as ?t= */
  accessToken = null,
}: {
  positions: OrderPositionView[];
  canForward: boolean;
  ticketPathPrefix?: string;
  accessToken?: string | null;
}) {
  const [holders, setHolders] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      positions.flatMap((p) =>
        p.tickets.map((t) => [t.id, t.holderLabel ?? ""] as const),
      ),
    ),
  );
  const [recipients, setRecipients] = useState<Record<string, HolderSnapshot | null>>(() =>
    Object.fromEntries(
      positions.flatMap((p) =>
        p.tickets.map((t) => {
          const locked =
            t.transferred && t.holderFirstName && t.holderLastName && t.holderEmail
              ? {
                  firstName: t.holderFirstName,
                  lastName: t.holderLastName,
                  email: t.holderEmail,
                }
              : null;
          return [t.id, locked] as const;
        }),
      ),
    ),
  );
  const [transferredIds, setTransferredIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      positions.flatMap((p) => p.tickets.map((t) => [t.id, t.transferred] as const)),
    ),
  );

  if (positions.length === 0) {
    return (
      <p className="rounded-[16px] border border-[var(--tf-line)] bg-white p-4 text-sm text-[var(--tf-text-secondary)]">
        Noch keine Tickets — Zahlung ausstehend.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {positions.map((position) => (
        <section
          key={position.id}
          className="overflow-hidden rounded-[20px] border border-[var(--tf-line)] bg-white shadow-[0_8px_28px_rgba(15,39,71,0.05)]"
        >
          <div className="border-b border-[var(--tf-line)] bg-[#f8fafc] px-5 py-4 md:px-6">
            <p className="text-base font-semibold text-[var(--tf-navy)]">
              {position.quantity}× {position.categorySnapshot}
            </p>
            <p className="mt-0.5 text-sm text-[var(--tf-text-secondary)]">
              {position.eventNameSnapshot}
            </p>
            {position.whenLabel ? (
              <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                {position.whenLabel}
                {position.placeLabel ? ` · ${position.placeLabel}` : ""}
              </p>
            ) : null}
            <p className="mt-2 text-xs font-medium text-[var(--tf-navy)]">
              {position.tickets.length} Ticket{position.tickets.length === 1 ? "" : "s"} — zum
              Anzeigen aufklappen
            </p>
          </div>

          <ul className="divide-y divide-[var(--tf-line)]">
            {position.tickets.map((ticket, index) => {
              const n = index + 1;
              const holder = holders[ticket.id];
              const locked = Boolean(transferredIds[ticket.id] || ticket.transferred);
              const lockedRecipient = recipients[ticket.id] ?? null;
              // Entry media: current holder/staff only. After local forward, hide immediately.
              const showQr = Boolean(
                ticket.canUseEntry && ticket.qrToken && !transferredIds[ticket.id],
              );

              return (
                <li key={ticket.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 transition hover:bg-[rgba(20,184,166,0.04)] md:px-6 [&::-webkit-details-marker]:hidden">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(15,39,71,0.06)] text-xs font-bold text-[var(--tf-navy)]">
                        {n}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[var(--tf-navy)]">
                          Ticket {n}
                          {ticket.seatLabel ? (
                            <span className="font-normal text-[var(--tf-teal-hover)]">
                              {" "}
                              · {ticket.seatLabel}
                            </span>
                          ) : null}
                          {locked ? (
                            <span className="ml-2 rounded-full bg-[rgba(15,39,71,0.08)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--tf-navy)]">
                              Weitergeleitet
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-[var(--tf-text-secondary)]">
                          {ticket.ticketNumber}
                          {holder ? ` · ${holder}` : ""}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-[var(--tf-text-secondary)] transition group-open:rotate-180" />
                    </summary>

                    <div className="space-y-4 px-5 pb-5 md:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[var(--tf-line)] bg-[#f8fafc] p-4">
                        <div className="space-y-1 text-sm">
                          <p className="font-semibold text-[var(--tf-navy)]">
                            {ticket.categorySnapshot}
                          </p>
                          {ticket.seatLabel ? (
                            <p className="font-medium text-[var(--tf-teal-hover)]">
                              {ticket.seatLabel}
                            </p>
                          ) : null}
                          <p className="text-xs text-[var(--tf-text-secondary)]">
                            {ticket.ticketNumber} · {presenceLabel(ticket.presence)}
                          </p>
                          {locked ? (
                            <p className="text-xs font-medium text-[var(--tf-teal-hover)]">
                              Weitergeleitet{holder ? ` an ${holder}` : ""} — QR/PDF gesperrt
                            </p>
                          ) : holder ? (
                            <p className="text-xs text-[var(--tf-text-secondary)]">
                              Inhaber: {holder}
                            </p>
                          ) : null}
                        </div>
                        {showQr ? (
                          <div className="rounded-xl border border-[var(--tf-line)] bg-white p-2">
                            <TicketQrImage token={ticket.qrToken!} size={112} />
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {showQr ? (
                          <a
                            href={
                              accessToken
                                ? `/api/v1/tickets/${ticket.id}/pdf?t=${encodeURIComponent(accessToken)}`
                                : `/api/v1/tickets/${ticket.id}/pdf`
                            }
                            className="tf-btn tf-btn-primary !min-h-10 text-sm"
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF speichern
                          </a>
                        ) : null}
                        <Link
                          href={
                            accessToken
                              ? `${ticketPathPrefix}/${ticket.id}?t=${encodeURIComponent(accessToken)}`
                              : `${ticketPathPrefix}/${ticket.id}`
                          }
                          className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                        >
                          Ticket öffnen
                        </Link>
                        {showQr ? <TicketResendButton ticketId={ticket.id} /> : null}
                      </div>

                      {canForward ? (
                        <TicketForwardForm
                          ticketId={ticket.id}
                          lockedRecipient={lockedRecipient}
                          onDone={(h) => {
                            setHolders((prev) => ({
                              ...prev,
                              [ticket.id]: `${h.firstName} ${h.lastName}`.trim(),
                            }));
                            setRecipients((prev) => ({ ...prev, [ticket.id]: h }));
                            setTransferredIds((prev) => ({ ...prev, [ticket.id]: true }));
                          }}
                        />
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
