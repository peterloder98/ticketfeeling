"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

const EMBED_HISTORY_KEY = "tf_embed_history";
const MAX_HISTORY = 30;

function isEmbedPath(pathname: string) {
  return pathname.startsWith("/embed");
}

function readHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(EMBED_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function writeHistory(paths: string[]) {
  try {
    sessionStorage.setItem(EMBED_HISTORY_KEY, JSON.stringify(paths.slice(-MAX_HISTORY)));
  } catch {
    /* ignore */
  }
}

/**
 * In-iframe back control. Tracks /embed/* visits in sessionStorage so Zurück
 * works even when document.referrer is the partner parent page.
 */
export function EmbedBackLink({
  fallbackHref = "/embed/shop",
  label = "Zurück",
  className,
  variant = "text",
}: {
  /** Used when there is no prior embed path in our stack */
  fallbackHref?: string | null;
  label?: string;
  className?: string;
  variant?: "text" | "button" | "header";
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!isEmbedPath(pathname)) return;
    const history = readHistory();
    const last = history[history.length - 1];
    if (last === pathname) return;
    writeHistory([...history, pathname]);
  }, [pathname]);

  function goBack() {
    const history = readHistory();
    // Drop current page if it's on top of the stack.
    while (history.length > 0 && history[history.length - 1] === pathname) {
      history.pop();
    }
    const previous = history.pop() ?? null;
    writeHistory(history);

    if (previous && previous !== pathname && isEmbedPath(previous)) {
      router.push(previous);
      return;
    }

    if (fallbackHref) {
      router.push(fallbackHref);
      return;
    }

    // Last resort: never leave the embed shell empty-handed.
    router.push("/embed/shop");
  }

  const base =
    variant === "header"
      ? "inline-flex items-center gap-1 rounded-lg border border-[#e2e8f0] bg-white px-2 py-1.5 text-xs font-semibold text-[var(--tf-navy)] hover:border-[var(--tf-teal)]"
      : variant === "button"
        ? "tf-btn tf-btn-secondary !min-h-10 text-sm"
        : "inline-flex items-center gap-1 text-xs font-medium text-[var(--tf-teal)] underline underline-offset-2";

  // Hide only on shop home when that is also the fallback (nothing useful to do).
  if (pathname === "/embed/shop" && (fallbackHref === "/embed/shop" || !fallbackHref)) {
    return null;
  }

  return (
    <button type="button" onClick={goBack} className={className ? `${base} ${className}` : base}>
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </button>
  );
}
