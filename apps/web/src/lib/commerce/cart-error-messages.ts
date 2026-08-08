/** Map cart / add-to-cart API error codes to clear German UI copy. */
export function cartErrorMessage(
  code: string,
  opts?: {
    available?: number | null;
    /** How many seats were unavailable (for plural UX). */
    unavailableCount?: number | null;
    /** When selection was partially healed. */
    selectionUpdated?: boolean;
  },
): string {
  const available =
    typeof opts?.available === "number" && Number.isFinite(opts.available)
      ? Math.max(0, Math.floor(opts.available))
      : null;
  const unavailableCount =
    typeof opts?.unavailableCount === "number" && Number.isFinite(opts.unavailableCount)
      ? Math.max(0, Math.floor(opts.unavailableCount))
      : null;

  switch (code) {
    case "SOLD_OUT":
      return "Leider ausverkauft.";
    case "INSUFFICIENT_STOCK":
      if (available != null && available > 0) {
        return `Nur noch ${available} verfügbar — wir haben die Anzahl angepasst.`;
      }
      return "Leider nicht mehr so viele Tickets frei.";
    case "SEATS_UNAVAILABLE":
      if (opts?.selectionUpdated) {
        if (unavailableCount != null && unavailableCount > 1) {
          return "Mehrere ausgewählte Plätze sind leider gerade nicht mehr verfügbar. Wir haben deine Auswahl aktualisiert.";
        }
        return "Ein ausgewählter Platz ist leider gerade nicht mehr verfügbar. Wir haben deine Auswahl aktualisiert.";
      }
      if (unavailableCount != null && unavailableCount > 1) {
        return "Mehrere ausgewählte Plätze sind leider gerade nicht mehr verfügbar.";
      }
      return "Ein ausgewählter Platz ist leider gerade nicht mehr verfügbar.";
    case "CREATES_SINGLETON_GAP":
      return "Deine Auswahl würde einen einzelnen freien Platz hinterlassen. Bitte wähle nach Möglichkeit direkt angrenzende Plätze.";
    case "COMPANION_SEAT_UNAVAILABLE":
      return "Neben dem gewählten Rollstuhlplatz ist kein Begleitplatz frei. Bitte anderen Platz wählen.";
    case "SEATS_REQUIRED":
      return "Bitte wähle die Plätze auf dem Saalplan.";
    case "QUANTITY_LIMIT":
      return "Ungültige Anzahl.";
    case "CATEGORY_UNAVAILABLE":
      return "Diese Kategorie ist gerade nicht buchbar.";
    case "SALE_CLOSED":
      return "Der Vorverkauf ist geschlossen.";
    case "ORG_MISMATCH":
      return "Warenkorb gehört zu einem anderen Veranstalter — bitte neu starten.";
    case "MULTI_EVENT_CART":
      return "Pro Bestellung ist nur ein Event möglich — bitte zuerst den Warenkorb leeren oder abschließen.";
    case "CART_EXPIRED":
      return "Reservierung abgelaufen — bitte erneut in den Warenkorb legen.";
    case "HOLD_EXPIRED":
      return "Deine Platzreservierung ist abgelaufen — bitte die Tickets erneut wählen.";
    case "CART_SEATS_UPDATED":
      return "Wir haben deine Auswahl aktualisiert, weil Plätze nicht mehr verfügbar waren.";
    case "EVENT_NOT_FOUND":
      return "Event nicht gefunden.";
    case "INVALID_QUANTITY":
      return "Ungültige Anzahl.";
    case "MAX_PER_ORDER":
      return "Maximale Anzahl pro Bestellung überschritten.";
    case "REQUEST_TIMEOUT":
      return "Das dauert zu lange — bitte kurz warten und erneut versuchen.";
    case "RATE_LIMITED":
      return "Zu viele Anfragen — bitte einen Moment warten.";
    default:
      return code?.trim() ? code : "Fehler beim Hinzufügen";
  }
}
