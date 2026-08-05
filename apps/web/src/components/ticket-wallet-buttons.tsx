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

function withToken(path: string, accessToken?: string | null) {
  if (!accessToken) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}t=${encodeURIComponent(accessToken)}`;
}

/**
 * "Zu Apple Wallet" / "Zu Google Wallet".
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

  const btn =
    size === "sm"
      ? "tf-btn tf-btn-secondary !min-h-10 text-sm"
      : "tf-btn tf-btn-secondary flex w-full !min-h-12 justify-center";

  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      <div className="flex flex-wrap gap-2">
        {appleEnabled ? (
          <a
            href={withToken(`/api/v1/tickets/${ticketId}/apple-wallet`, accessToken)}
            className={btn}
            rel="noreferrer"
          >
            Zu Apple Wallet
          </a>
        ) : (
          <button type="button" className={btn} disabled aria-disabled="true" title={PREVIEW_HINT}>
            Zu Apple Wallet
          </button>
        )}
        {googleEnabled ? (
          <a
            href={withToken(`/api/v1/tickets/${ticketId}/google-wallet`, accessToken)}
            className={btn}
            rel="noreferrer"
            target="_blank"
          >
            Zu Google Wallet
          </a>
        ) : (
          <button type="button" className={btn} disabled aria-disabled="true" title={PREVIEW_HINT}>
            Zu Google Wallet
          </button>
        )}
      </div>
      {anyPreview ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">{PREVIEW_HINT}</p>
      ) : null}
    </div>
  );
}
