/** Clear staff-facing label for box-office storno / detail lists. */

export type BoxOfficeTicketLabelInput = {
  ticketNumber: string;
  categorySnapshot: string;
  seatLabel?: string | null;
  seatRow?: string | null;
  seatNumber?: string | null;
  blockLabel?: string | null;
};

/** Exact seat designation from saalplan fields when present. */
export function formatBoxOfficeSeatDesignation(
  ticket: Pick<
    BoxOfficeTicketLabelInput,
    "seatLabel" | "seatRow" | "seatNumber" | "blockLabel"
  >,
): string | null {
  const fromLabel = ticket.seatLabel?.trim();
  if (fromLabel) return fromLabel;

  const parts: string[] = [];
  if (ticket.blockLabel?.trim()) parts.push(ticket.blockLabel.trim());
  if (ticket.seatRow?.trim()) parts.push(`Reihe ${ticket.seatRow.trim()}`);
  if (ticket.seatNumber?.trim()) parts.push(`Platz ${ticket.seatNumber.trim()}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatBoxOfficeTicketLines(ticket: BoxOfficeTicketLabelInput): {
  title: string;
  detail: string;
} {
  const seat = formatBoxOfficeSeatDesignation(ticket);
  if (seat) {
    return {
      title: seat,
      detail: `${ticket.ticketNumber} · ${ticket.categorySnapshot}`,
    };
  }
  return {
    title: ticket.ticketNumber,
    detail: ticket.categorySnapshot,
  };
}
