"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

function priorEmbedPath(pathname: string): string | null {
  const stack = [...readHistory()];
  while (stack.length > 0 && stack[stack.length - 1] === pathname) {
    stack.pop();
  }
  const previous = stack[stack.length - 1] ?? null;
  if (previous && previous !== pathname && isEmbedPath(previous)) {
    return previous;
  }
  return null;
}

/** Records /embed/* visits so Zurück can stay inside the iframe. */
export function EmbedHistoryTracker() {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!isEmbedPath(pathname)) return;
    const history = readHistory();
    if (history[history.length - 1] === pathname) return;
    writeHistory([...history, pathname]);
  }, [pathname]);

  return null;
}

/**
 * In-iframe back control. Only shown after the user has navigated within the
 * embed (sessionStorage stack has a prior /embed path). Hidden on the initial
 * landing page of the session.
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
  variant?: "text" | "button";
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Parent EmbedHistoryTracker may not have written yet (effects run child→parent).
    // Prefer existing prior paths; also treat a non-current top as prior.
    setVisible(priorEmbedPath(pathname) != null);
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

    router.push("/embed/shop");
  }

  if (!visible) return null;

  const base =
    variant === "button"
      ? "tf-btn tf-btn-secondary !min-h-10 text-sm"
      : "inline-flex items-center gap-1 text-xs font-medium text-[var(--tf-teal)] underline underline-offset-2";

  return (
    <button type="button" onClick={goBack} className={className ? `${base} ${className}` : base}>
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </button>
  );
}
