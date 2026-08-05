"use client";

type Props = {
  ticketId: string;
  /** Guest order access token */
  accessToken?: string | null;
  appleEnabled?: boolean;
  googleEnabled?: boolean;
  className?: string;
  size?: "sm" | "md";
};

const PREVIEW_HINT = "Vorschau – Einrichtung folgt";

/** Official badge artwork under /public/wallet (Apple + Google brand kits). */
const APPLE_BADGE = {
  src: "/wallet/add-to-apple-wallet.svg",
  alt: "Zu Apple Wallet hinzufügen",
} as const;

const GOOGLE_BADGE = {
  src: "/wallet/add-to-google-wallet.svg",
  alt: "Zu Google Wallet hinzufügen",
} as const;

function withToken(path: string, accessToken?: string | null) {
  if (!accessToken) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}t=${encodeURIComponent(accessToken)}`;
}

function BadgeImg({
  src,
  alt,
  size,
}: {
  src: string;
  alt: string;
  size: "sm" | "md";
}) {
  // Height-driven; width auto — never stretch official badges.
  const heightClass = size === "sm" ? "h-10" : "h-12";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand SVG badges, not optimized photos
    <img
      src={src}
      alt={alt}
      className={`${heightClass} w-auto max-w-full`}
      draggable={false}
    />
  );
}

/**
 * Official Apple / Google Wallet badges.
 * When a provider is not configured, still render a disabled preview so layout
 * and look can be checked — no dead download links.
 */
export function TicketWalletButtons({
  ticketId,
  accessToken = null,
  appleEnabled = false,
  googleEnabled = false,
  className = "",
  size = "sm",
}: Props) {
  const applePreview = !appleEnabled;
  const googlePreview = !googleEnabled;
  const anyPreview = applePreview || googlePreview;

  const badgeLink =
    "inline-flex shrink-0 items-center transition-opacity duration-200 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-teal)]";
  const badgeDisabled =
    "inline-flex shrink-0 cursor-not-allowed items-center opacity-45";

  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {googleEnabled ? (
          <a
            href={withToken(`/api/v1/tickets/${ticketId}/google-wallet`, accessToken)}
            className={badgeLink}
            rel="noreferrer"
            target="_blank"
            aria-label={GOOGLE_BADGE.alt}
          >
            <BadgeImg {...GOOGLE_BADGE} size={size} />
          </a>
        ) : (
          <span className={badgeDisabled} aria-disabled="true" title={PREVIEW_HINT}>
            <BadgeImg {...GOOGLE_BADGE} size={size} />
          </span>
        )}
        {appleEnabled ? (
          <a
            href={withToken(`/api/v1/tickets/${ticketId}/apple-wallet`, accessToken)}
            className={badgeLink}
            rel="noreferrer"
            aria-label={APPLE_BADGE.alt}
          >
            <BadgeImg {...APPLE_BADGE} size={size} />
          </a>
        ) : (
          <span className={badgeDisabled} aria-disabled="true" title={PREVIEW_HINT}>
            <BadgeImg {...APPLE_BADGE} size={size} />
          </span>
        )}
      </div>
      {anyPreview ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">{PREVIEW_HINT}</p>
      ) : null}
    </div>
  );
}
