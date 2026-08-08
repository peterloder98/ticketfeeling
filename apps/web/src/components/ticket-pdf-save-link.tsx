"use client";

import type { ReactNode } from "react";

type Props = {
  href: string;
  className?: string;
  children?: ReactNode;
  /** Suggested filename for the download attribute (server also sends Content-Disposition). */
  filename?: string;
};

/**
 * Triggers a direct PDF file download (attachment), not a broken inline viewer tab.
 */
export function TicketPdfSaveLink({
  href,
  className,
  children = "PDF speichern",
  filename,
}: Props) {
  return (
    <a href={href} className={className} download={filename || undefined}>
      {children}
    </a>
  );
}
