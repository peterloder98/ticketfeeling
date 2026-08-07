/** Common domain typos → suggested correction (never auto-applied). */
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmai.com": "gmail.com",
  "hotnail.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "icoud.com": "icloud.com",
  "icloid.com": "icloud.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
};

export function suggestEmailDomainFix(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!domain || !local) return null;
  const fixed = DOMAIN_TYPOS[domain];
  if (!fixed) return null;
  return `${local}@${fixed}`;
}
