"use client";

import { useState } from "react";

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

/** Bump when badge artwork changes so CDNs / browsers refetch. */
const BADGE_CACHE = "v=20260805b";

type Badge = {
  /** Prefer PNG — Apple’s Illustrator SVG historically broke as <img> (DOCTYPE / xlink). */
  png: string;
  svg: string;
  alt: string;
  /** Intrinsic pixel size of the PNG (keeps layout stable while loading). */
  width: number;
  height: number;
};

const APPLE_BADGE: Badge = {
  png: `/wallet/add-to-apple-wallet.png?${BADGE_CACHE}`,
  svg: `/wallet/add-to-apple-wallet.svg?${BADGE_CACHE}`,
  alt: "Zu Apple Wallet hinzufügen",
  width: 388,
  height: 120,
};

const GOOGLE_BADGE: Badge = {
  png: `/wallet/add-to-google-wallet.png?${BADGE_CACHE}`,
  svg: `/wallet/add-to-google-wallet.svg?${BADGE_CACHE}`,
  alt: "Zu Google Wallet hinzufügen",
  width: 362,
  height: 100,
};

function withToken(path: string, accessToken?: string | null) {
  if (!accessToken) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}t=${encodeURIComponent(accessToken)}`;
}

function BadgeImg({ badge, size }: { badge: Badge; size: "sm" | "md" }) {
  const [src, setSrc] = useState(badge.png);
  const displayH = size === "sm" ? 40 : 48;
  const displayW = Math.round((badge.width / badge.height) * displayH);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand badges from /public, not optimized photos
    <img
      src={src}
      alt={badge.alt}
      width={displayW}
      height={displayH}
      className="block max-w-full"
      style={{ height: displayH, width: "auto" }}
      draggable={false}
      decoding="async"
      onError={() => {
        if (src !== badge.svg) setSrc(badge.svg);
      }}
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
    "inline-flex w-fit shrink-0 items-center transition-opacity duration-200 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-teal)]";
  const badgeDisabled =
    "inline-flex w-fit shrink-0 cursor-not-allowed items-center opacity-60";

  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      <div className="flex flex-col items-start gap-2.5">
        {googleEnabled ? (
          <a
            href={withToken(`/api/v1/tickets/${ticketId}/google-wallet`, accessToken)}
            className={badgeLink}
            rel="noreferrer"
            target="_blank"
            aria-label={GOOGLE_BADGE.alt}
          >
            <BadgeImg badge={GOOGLE_BADGE} size={size} />
          </a>
        ) : (
          <span className={badgeDisabled} aria-disabled="true" title={PREVIEW_HINT}>
            <BadgeImg badge={GOOGLE_BADGE} size={size} />
          </span>
        )}
        {appleEnabled ? (
          <a
            href={withToken(`/api/v1/tickets/${ticketId}/apple-wallet`, accessToken)}
            className={badgeLink}
            rel="noreferrer"
            aria-label={APPLE_BADGE.alt}
          >
            <BadgeImg badge={APPLE_BADGE} size={size} />
          </a>
        ) : (
          <span className={badgeDisabled} aria-disabled="true" title={PREVIEW_HINT}>
            <BadgeImg badge={APPLE_BADGE} size={size} />
          </span>
        )}
      </div>
      {anyPreview ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">{PREVIEW_HINT}</p>
      ) : null}
    </div>
  );
}
