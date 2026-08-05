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

function withToken(path: string, accessToken?: string | null) {
  if (!accessToken) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}t=${encodeURIComponent(accessToken)}`;
}

/**
 * "Zu Apple Wallet" / "Zu Google Wallet" — only rendered when the matching
 * provider is configured server-side (buyers never see setup errors).
 */
export function TicketWalletButtons({
  ticketId,
  accessToken = null,
  appleEnabled = false,
  googleEnabled = false,
  className = "",
  size = "sm",
}: Props) {
  if (!appleEnabled && !googleEnabled) return null;

  const btn =
    size === "sm"
      ? "tf-btn tf-btn-secondary !min-h-10 text-sm"
      : "tf-btn tf-btn-secondary flex w-full !min-h-12 justify-center";

  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {appleEnabled ? (
        <a
          href={withToken(`/api/v1/tickets/${ticketId}/apple-wallet`, accessToken)}
          className={btn}
          rel="noreferrer"
        >
          Zu Apple Wallet
        </a>
      ) : null}
      {googleEnabled ? (
        <a
          href={withToken(`/api/v1/tickets/${ticketId}/google-wallet`, accessToken)}
          className={btn}
          rel="noreferrer"
          target="_blank"
        >
          Zu Google Wallet
        </a>
      ) : null}
    </div>
  );
}
