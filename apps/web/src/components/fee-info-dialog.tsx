"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import {
  DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS,
  PLATFORM_FEE_INFO_BULLETS,
  buildPlatformFeeInfoClosing,
} from "@/lib/commerce/platform-fee";

/** Above saalplan tooltips (z-80), sticky Kaufleiste, zoom controls, chat widget. */
const FEE_MODAL_Z_INDEX = 200;

function resolveFeeBps(feePercentageBasisPoints?: number, note?: string | null): number {
  if (typeof feePercentageBasisPoints === "number" && feePercentageBasisPoints > 0) {
    return feePercentageBasisPoints;
  }
  if (note) {
    const m = note.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (m) {
      const pct = Number(m[1].replace(",", "."));
      if (Number.isFinite(pct) && pct > 0) return Math.round(pct * 100);
    }
  }
  return DEFAULT_PLATFORM_FEE_PERCENTAGE_BPS;
}

function lockBodyScroll() {
  const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  const prevOverflow = document.body.style.overflow;
  const prevPaddingRight = document.body.style.paddingRight;
  document.body.style.overflow = "hidden";
  if (scrollbarGap > 0) {
    document.body.style.paddingRight = `${scrollbarGap}px`;
  }
  return () => {
    document.body.style.overflow = prevOverflow;
    document.body.style.paddingRight = prevPaddingRight;
  };
}

/** Block parent Link/card navigation without cancelling the control's own click. */
function stopBubble(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

function stopAll(e: { preventDefault: () => void; stopPropagation: () => void }) {
  e.preventDefault();
  e.stopPropagation();
}

function FeeInfoModal({
  open,
  onClose,
  feePercentageBasisPoints,
}: {
  open: boolean;
  onClose: () => void;
  feePercentageBasisPoints: number;
}) {
  const titleId = useId();
  const closing = buildPlatformFeeInfoClosing(feePercentageBasisPoints);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const unlock = lockBodyScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [open, onClose]);

  const closeFromUi = useCallback(
    (e: MouseEvent) => {
      stopAll(e);
      onClose();
    },
    [onClose],
  );

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-[rgba(15,39,71,0.55)] p-4"
      style={{ zIndex: FEE_MODAL_Z_INDEX }}
      role="presentation"
      onClick={closeFromUi}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm rounded-2xl border border-[var(--tf-line)] bg-[var(--tf-card)] p-4 shadow-[0_20px_50px_rgba(15,39,71,0.28)] md:p-5"
        onClick={stopAll}
        onMouseDown={stopBubble}
        onPointerDown={stopBubble}
      >
        <button
          type="button"
          className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-[var(--tf-text-secondary)] hover:bg-[rgba(15,39,71,0.06)] hover:text-[var(--tf-navy)]"
          aria-label="Schließen"
          onClick={closeFromUi}
          onMouseDown={stopBubble}
          onPointerDown={stopBubble}
        >
          <X className="h-5 w-5" />
        </button>

        <h3 id={titleId} className="pr-9 text-base font-semibold text-[var(--tf-navy)] md:text-lg">
          Was beinhaltet die Verwaltungsgebühr?
        </h3>
        <p className="mt-1.5 text-sm leading-snug text-[var(--tf-text-secondary)]">
          Sie deckt den sicheren Betrieb Ihres Ticketkaufs ab:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-snug text-[var(--tf-navy)]">
          {PLATFORM_FEE_INFO_BULLETS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3.5 text-sm leading-snug text-[var(--tf-text-secondary)]">{closing}</p>
        <button
          type="button"
          className="tf-btn tf-btn-primary mt-4 w-full"
          onClick={closeFromUi}
          onMouseDown={stopBubble}
          onPointerDown={stopBubble}
        >
          Verstanden
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Compact teal info icon that opens the Verwaltungsgebühr explanation dialog. */
export function FeeInfoIconButton({
  feePercentageBasisPoints,
  note,
  className = "",
  iconClassName = "h-3.5 w-3.5",
}: {
  feePercentageBasisPoints?: number;
  /** Used to infer % when basis points are not passed. */
  note?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const bps = resolveFeeBps(feePercentageBasisPoints, note);
  const close = useCallback(() => setOpen(false), []);

  function openDialog(e: MouseEvent) {
    stopAll(e);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        onMouseDown={stopAll}
        onPointerDown={stopAll}
        onKeyDown={(e) => e.stopPropagation()}
        className={`inline-flex shrink-0 items-center justify-center rounded-full text-[var(--tf-teal)] transition hover:bg-[rgba(20,184,166,0.12)] hover:text-[var(--tf-teal-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-teal)] ${className}`}
        aria-label="Was ist die Verwaltungsgebühr?"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Info className={iconClassName} aria-hidden />
      </button>
      <FeeInfoModal open={open} onClose={close} feePercentageBasisPoints={bps} />
    </>
  );
}

/**
 * Inline „zzgl. … Verwaltungsgebühr“ line with a clickable info icon.
 * Use beside ticket prices, listing cards, and booking panels.
 */
export function FeeSurchargeNote({
  note,
  feePercentageBasisPoints,
  className = "",
  textClassName = "text-[11px] text-[var(--tf-text-secondary)]",
  as: Tag = "span",
}: {
  note: string;
  feePercentageBasisPoints?: number;
  className?: string;
  textClassName?: string;
  as?: "span" | "p";
}) {
  if (!note.trim()) return null;
  return (
    <Tag className={`inline-flex items-center gap-1 ${className}`}>
      <span className={textClassName}>{note}</span>
      <FeeInfoIconButton
        note={note}
        feePercentageBasisPoints={feePercentageBasisPoints}
        className="-m-0.5 p-0.5"
      />
    </Tag>
  );
}

/** Optional helper when composing mixed fee + status lines. */
export function FeeInfoIconBeside({
  children,
  feePercentageBasisPoints,
  note,
}: {
  children: ReactNode;
  feePercentageBasisPoints?: number;
  note?: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <FeeInfoIconButton
        feePercentageBasisPoints={feePercentageBasisPoints}
        note={note}
        className="-m-0.5 p-0.5"
      />
    </span>
  );
}
