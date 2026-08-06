"use client";

import {
  SAALPLAN_DONE_MESSAGE,
  type SaalplanDoneMessage,
} from "@/lib/saalplan/popup";

type Props = {
  href: string;
  label: string;
  className?: string;
  planId?: string;
};

/**
 * Return from Saalplan editor: notify opener, close popup, or fall back to href.
 * Plain <Link> navigation leaves the extra window open — that must not happen.
 */
export function SaalplanReturnButton({ href, label, className, planId }: Props) {
  function goBack(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();

    const payload: SaalplanDoneMessage = {
      type: SAALPLAN_DONE_MESSAGE,
      planId,
      returnTo: href,
    };

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
        try {
          window.opener.focus();
        } catch {
          /* cross-window focus may be blocked */
        }
      }
    } catch {
      /* ignore */
    }

    window.close();

    window.setTimeout(() => {
      if (!window.closed) {
        window.location.assign(href);
      }
    }, 120);
  }

  return (
    <a href={href} className={className} onClick={goBack}>
      {label}
    </a>
  );
}
