/**
 * Public venue line: Name · Street, PLZ City
 * Never repeat the venue name as the street (common bad Location.street data).
 */

export type LocationAddressFields = {
  name?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function sameLabel(a: string, b: string): boolean {
  return a.localeCompare(b, "de", { sensitivity: "accent" }) === 0;
}

/** Street + house number, or null when empty / equal to venue name. */
export function formatLocationStreetLine(location: LocationAddressFields): string | null {
  const name = norm(location.name);
  const streetOnly = norm(location.street);
  const house = norm(location.houseNumber);
  const street = [streetOnly, house].filter(Boolean).join(" ");
  if (!street) return null;
  // Bad data: street was filled with the venue name → would render "Name · Name, PLZ City"
  if (name && (sameLabel(street, name) || sameLabel(streetOnly, name))) return null;
  return street;
}

export function formatLocationCityLine(location: LocationAddressFields): string | null {
  const city = [norm(location.postalCode), norm(location.city)].filter(Boolean).join(" ");
  return city || null;
}

/** Address after the middle dot: "Street, PLZ City" or "PLZ City". */
export function formatLocationAddressLine(location: LocationAddressFields): string | null {
  const street = formatLocationStreetLine(location);
  const city = formatLocationCityLine(location);
  return [street, city].filter(Boolean).join(", ") || null;
}

/**
 * Hero / listing place: "Name · Street, PLZ City" (or "Name · PLZ City" when street missing).
 */
export function formatLocationPlaceDisplay(location: LocationAddressFields | null | undefined): {
  name: string | null;
  addressLine: string | null;
  label: string | null;
} {
  if (!location) return { name: null, addressLine: null, label: null };
  const name = norm(location.name) || null;
  const addressLine = formatLocationAddressLine(location);
  const label = [name, addressLine].filter(Boolean).join(" · ") || null;
  return { name, addressLine, label };
}
