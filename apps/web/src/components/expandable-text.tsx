"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Collapses long copy with “Mehr anzeigen” instead of hard-cutting with ellipsis only.
 */
export function ExpandableText({
  text,
  lines = 3,
  className = "",
  moreLabel = "Mehr anzeigen",
  lessLabel = "Weniger anzeigen",
}: {
  text: string;
  lines?: number;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure() {
      if (!el || expanded) return;
      // Overflow means clamped content is cut off
      setNeedsToggle(el.scrollHeight > el.clientHeight + 1);
    }

    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text, lines, expanded]);

  return (
    <div className={className}>
      <p
        ref={ref}
        className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--tf-text-secondary)]"
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical" as const,
                overflow: "hidden",
              }
        }
      >
        {text}
      </p>
      {needsToggle || expanded ? (
        <button
          type="button"
          className="mt-1 text-xs font-semibold text-[var(--tf-teal)] underline underline-offset-2"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  );
}
