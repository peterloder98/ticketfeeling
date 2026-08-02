"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

function isEmbedPath(pathname: string) {
  return pathname.startsWith("/embed");
}

/**
 * In-iframe back control. Uses browser history when the previous page was also
 * inside /embed/* — never dumps the customer onto the full event listing by default.
 */
export function EmbedBackLink({
  fallbackHref,
  label = "Zurück",
  className,
  variant = "text",
}: {
  /** Used only when there is no usable embed history */
  fallbackHref?: string | null;
  label?: string;
  className?: string;
  variant?: "text" | "button" | "header";
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  function goBack() {
    try {
      const ref = document.referrer;
      if (ref) {
        const refUrl = new URL(ref);
        if (
          refUrl.origin === window.location.origin &&
          isEmbedPath(refUrl.pathname) &&
          refUrl.pathname !== pathname
        ) {
          router.back();
          return;
        }
      }
    } catch {
      /* ignore */
    }

    // Same-origin SPA navigations often leave history even without a parseable referrer.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    if (fallbackHref) {
      router.push(fallbackHref);
    }
  }

  const base =
    variant === "header"
      ? "inline-flex items-center gap-1 rounded-lg border border-[#e2e8f0] bg-white px-2 py-1.5 text-xs font-semibold text-[var(--tf-navy)] hover:border-[var(--tf-teal)]"
      : variant === "button"
        ? "tf-btn tf-btn-secondary !min-h-10 text-sm"
        : "inline-flex items-center gap-1 text-xs font-medium text-[var(--tf-teal)] underline underline-offset-2";

  // Nothing to go back to and no fallback — hide (avoids "Alle Events" trap).
  const canShow = Boolean(fallbackHref) || pathname !== "/embed/shop";
  if (!canShow) return null;

  return (
    <button type="button" onClick={goBack} className={className ? `${base} ${className}` : base}>
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </button>
  );
}
