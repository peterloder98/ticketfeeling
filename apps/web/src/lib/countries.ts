/** ISO-3166 alpha-2 countries (German names) with dial codes for phone picker. */

export type Country = {
  code: string;
  name: string;
  dial: string;
};

export function flagEmoji(code: string): string {
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "🏳️";
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)),
  );
}

/** Letters (incl. accents), spaces, hyphen, apostrophe — no digits. */
export function lettersOnlyCountryQuery(raw: string): string {
  return raw.replace(/[^\p{L}\s'\-.]/gu, "").slice(0, 60);
}

export const WORLD_COUNTRIES: Country[] = [
  { code: "DE", name: "Deutschland", dial: "+49" },
  { code: "AT", name: "Österreich", dial: "+43" },
  { code: "CH", name: "Schweiz", dial: "+41" },
  { code: "NL", name: "Niederlande", dial: "+31" },
  { code: "BE", name: "Belgien", dial: "+32" },
  { code: "LU", name: "Luxemburg", dial: "+352" },
  { code: "FR", name: "Frankreich", dial: "+33" },
  { code: "IT", name: "Italien", dial: "+39" },
  { code: "ES", name: "Spanien", dial: "+34" },
  { code: "PT", name: "Portugal", dial: "+351" },
  { code: "PL", name: "Polen", dial: "+48" },
  { code: "CZ", name: "Tschechien", dial: "+420" },
  { code: "SK", name: "Slowakei", dial: "+421" },
  { code: "HU", name: "Ungarn", dial: "+36" },
  { code: "DK", name: "Dänemark", dial: "+45" },
  { code: "SE", name: "Schweden", dial: "+46" },
  { code: "NO", name: "Norwegen", dial: "+47" },
  { code: "FI", name: "Finnland", dial: "+358" },
  { code: "IE", name: "Irland", dial: "+353" },
  { code: "GB", name: "Großbritannien", dial: "+44" },
  { code: "US", name: "USA", dial: "+1" },
  { code: "CA", name: "Kanada", dial: "+1" },
  { code: "AU", name: "Australien", dial: "+61" },
  { code: "NZ", name: "Neuseeland", dial: "+64" },
  { code: "TR", name: "Türkei", dial: "+90" },
  { code: "GR", name: "Griechenland", dial: "+30" },
  { code: "HR", name: "Kroatien", dial: "+385" },
  { code: "SI", name: "Slowenien", dial: "+386" },
  { code: "RO", name: "Rumänien", dial: "+40" },
  { code: "BG", name: "Bulgarien", dial: "+359" },
  { code: "RS", name: "Serbien", dial: "+381" },
  { code: "BA", name: "Bosnien und Herzegowina", dial: "+387" },
  { code: "MK", name: "Nordmazedonien", dial: "+389" },
  { code: "AL", name: "Albanien", dial: "+355" },
  { code: "UA", name: "Ukraine", dial: "+380" },
  { code: "RU", name: "Russland", dial: "+7" },
  { code: "BY", name: "Belarus", dial: "+375" },
  { code: "LT", name: "Litauen", dial: "+370" },
  { code: "LV", name: "Lettland", dial: "+371" },
  { code: "EE", name: "Estland", dial: "+372" },
  { code: "IS", name: "Island", dial: "+354" },
  { code: "MT", name: "Malta", dial: "+356" },
  { code: "CY", name: "Zypern", dial: "+357" },
  { code: "JP", name: "Japan", dial: "+81" },
  { code: "CN", name: "China", dial: "+86" },
  { code: "KR", name: "Südkorea", dial: "+82" },
  { code: "IN", name: "Indien", dial: "+91" },
  { code: "BR", name: "Brasilien", dial: "+55" },
  { code: "AR", name: "Argentinien", dial: "+54" },
  { code: "MX", name: "Mexiko", dial: "+52" },
  { code: "ZA", name: "Südafrika", dial: "+27" },
  { code: "AE", name: "Vereinigte Arabische Emirate", dial: "+971" },
  { code: "IL", name: "Israel", dial: "+972" },
  { code: "EG", name: "Ägypten", dial: "+20" },
  { code: "MA", name: "Marokko", dial: "+212" },
  { code: "TN", name: "Tunesien", dial: "+216" },
  { code: "TH", name: "Thailand", dial: "+66" },
  { code: "VN", name: "Vietnam", dial: "+84" },
  { code: "SG", name: "Singapur", dial: "+65" },
  { code: "MY", name: "Malaysia", dial: "+60" },
  { code: "ID", name: "Indonesien", dial: "+62" },
  { code: "PH", name: "Philippinen", dial: "+63" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "CO", name: "Kolumbien", dial: "+57" },
  { code: "PE", name: "Peru", dial: "+51" },
  { code: "UY", name: "Uruguay", dial: "+598" },
  { code: "CR", name: "Costa Rica", dial: "+506" },
  { code: "LI", name: "Liechtenstein", dial: "+423" },
  { code: "MC", name: "Monaco", dial: "+377" },
  { code: "AD", name: "Andorra", dial: "+376" },
  { code: "SM", name: "San Marino", dial: "+378" },
  { code: "VA", name: "Vatikanstadt", dial: "+379" },
  { code: "MD", name: "Moldau", dial: "+373" },
  { code: "GE", name: "Georgien", dial: "+995" },
  { code: "AM", name: "Armenien", dial: "+374" },
  { code: "AZ", name: "Aserbaidschan", dial: "+994" },
  { code: "KZ", name: "Kasachstan", dial: "+7" },
  { code: "HK", name: "Hongkong", dial: "+852" },
  { code: "TW", name: "Taiwan", dial: "+886" },
].sort((a, b) => a.name.localeCompare(b.name, "de"));

export function findCountry(code: string): Country | undefined {
  return WORLD_COUNTRIES.find((c) => c.code === code.toUpperCase());
}
