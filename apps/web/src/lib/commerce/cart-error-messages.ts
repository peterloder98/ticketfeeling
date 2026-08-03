/** Map cart / add-to-cart API error codes to clear German UI copy. */
export function cartErrorMessage(code: string): string {
  switch (code) {
    case "SOLD_OUT":
      return "Leider ausverkauft.";
    case "SEATS_UNAVAILABLE":
      return "Diese Plätze sind gerade nicht mehr frei — bitte neu wählen.";
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
    case "CART_EXPIRED":
      return "Reservierung abgelaufen — bitte erneut in den Warenkorb legen.";
    case "HOLD_EXPIRED":
      return "Deine Platzreservierung ist abgelaufen — bitte die Tickets erneut wählen.";
    case "EVENT_NOT_FOUND":
      return "Event nicht gefunden.";
    case "INVALID_QUANTITY":
      return "Ungültige Anzahl.";
    case "MAX_PER_ORDER":
      return "Maximale Anzahl pro Bestellung überschritten.";
    default:
      return code?.trim() ? code : "Fehler beim Hinzufügen";
  }
}
