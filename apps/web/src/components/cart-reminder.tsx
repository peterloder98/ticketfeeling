"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ShoppingCart, X, Clock } from "lucide-react";
import { useCart } from "@/components/cart-context";
import { useCartCountdown } from "@/hooks/use-cart-countdown";
import { CART_REMIND_AT_MS } from "@/lib/cart-countdown";

type Milestone = "soft" | "five" | "two";

const SOFT_DISMISS_KEY = "tf-cart-reminder-dismissed-count";
const MILESTONE_KEY = "tf-cart-milestones";

function shouldHide(pathname: string) {
  return (
    pathname.startsWith("/warenkorb") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/konto/bestellung") ||
    pathname.startsWith("/ticket/") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/kasse") ||
    pathname.startsWith("/scanner") ||
    pathname.startsWith("/login")
  );
}

function readMilestones(expiresAt: string | null): { five: boolean; two: boolean } {
  if (!expiresAt) return { five: false, two: false };
  try {
    const raw = sessionStorage.getItem(MILESTONE_KEY);
    if (!raw) return { five: false, two: false };
    const parsed = JSON.parse(raw) as { expiresAt?: string; five?: boolean; two?: boolean };
    if (parsed.expiresAt !== expiresAt) return { five: false, two: false };
    return { five: Boolean(parsed.five), two: Boolean(parsed.two) };
  } catch {
    return { five: false, two: false };
  }
}

function writeMilestones(
  expiresAt: string,
  next: { five: boolean; two: boolean },
) {
  try {
    sessionStorage.setItem(
      MILESTONE_KEY,
      JSON.stringify({ expiresAt, five: next.five, two: next.two }),
    );
  } catch {
    /* ignore */
  }
}

export function CartReminder() {
  const pathname = usePathname();
  const { itemCount, grossFormatted, expiresAt, refresh } = useCart();
  const countdown = useCartCountdown(expiresAt);
  const [dismissedForCount, setDismissedForCount] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);
  const milestones = useRef({ five: false, two: false });
  const prevRemaining = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SOFT_DISMISS_KEY);
      setDismissedForCount(raw ? Number(raw) : null);
    } catch {
      setDismissedForCount(null);
    }
    milestones.current = readMilestones(expiresAt);
    setReady(true);
  }, [expiresAt]);

  useEffect(() => {
    if (!ready) return;
    if (itemCount === 0) {
      try {
        sessionStorage.removeItem(SOFT_DISMISS_KEY);
        sessionStorage.removeItem(MILESTONE_KEY);
      } catch {
        /* ignore */
      }
      setDismissedForCount(null);
      setActiveMilestone(null);
      milestones.current = { five: false, two: false };
      prevRemaining.current = null;
    }
  }, [itemCount, ready]);

  // Soft reminder after a short delay when cart has items (initial nudge)
  useEffect(() => {
    if (!ready || itemCount < 1 || shouldHide(pathname)) return;
    if (dismissedForCount === itemCount) return;
    if (activeMilestone) return;
    const t = window.setTimeout(() => setActiveMilestone("soft"), 2500);
    return () => window.clearTimeout(t);
  }, [ready, itemCount, pathname, dismissedForCount, activeMilestone]);

  // Milestone reminders at 5:00 and 2:00 remaining — force show even if soft was dismissed
  useEffect(() => {
    if (!ready || !countdown || itemCount < 1 || !expiresAt) return;

    const remaining = countdown.remainingMs;
    const prev = prevRemaining.current;
    prevRemaining.current = remaining;

    if (countdown.expired) {
      void refresh();
      return;
    }

    // Fire when crossing thresholds (or already below on first load)
    const crossedFive =
      remaining <= CART_REMIND_AT_MS.fiveMinutes &&
      (prev == null || prev > CART_REMIND_AT_MS.fiveMinutes);
    const crossedTwo =
      remaining <= CART_REMIND_AT_MS.twoMinutes &&
      (prev == null || prev > CART_REMIND_AT_MS.twoMinutes);

    if (crossedTwo && !milestones.current.two) {
      milestones.current = { ...milestones.current, two: true, five: true };
      writeMilestones(expiresAt, milestones.current);
      setActiveMilestone("two");
      return;
    }

    if (crossedFive && !milestones.current.five) {
      milestones.current = { ...milestones.current, five: true };
      writeMilestones(expiresAt, milestones.current);
      setActiveMilestone("five");
    }
  }, [countdown, ready, itemCount, expiresAt, refresh]);

  if (!ready || itemCount < 1 || shouldHide(pathname)) return null;

  const softHidden = dismissedForCount === itemCount && activeMilestone === "soft";
  const showPanel =
    Boolean(activeMilestone) &&
    !(activeMilestone === "soft" && softHidden);

  function dismiss() {
    if (activeMilestone === "soft") {
      try {
        sessionStorage.setItem(SOFT_DISMISS_KEY, String(itemCount));
      } catch {
        /* ignore */
      }
      setDismissedForCount(itemCount);
    }
    setActiveMilestone(null);
  }

  const title =
    activeMilestone === "two"
      ? "Noch kurze Zeit"
      : activeMilestone === "five"
        ? "Reservierung läuft"
        : `Noch ${itemCount} ${itemCount === 1 ? "Ticket" : "Tickets"} im Warenkorb`;

  const body =
    activeMilestone === "two"
      ? "Am besten bald abschließen — im Warenkorb sind deine Tickets noch für dich gesichert."
      : activeMilestone === "five"
        ? "Im Warenkorb wartet noch etwas auf dich. Zurückkehren und bestellen?"
        : `${grossFormatted ? `${grossFormatted} · ` : ""}Weiter shoppen oder jetzt zur Kasse?`;

  const milestoneTone =
    activeMilestone === "two" || activeMilestone === "five"
      ? {
          shell: "border-[var(--tf-action-border)]",
          icon: "bg-[var(--tf-action-bg)] text-[var(--tf-action-accent)]",
        }
      : {
          shell: "border-[var(--tf-line)]",
          icon: "bg-[rgba(20,184,166,0.12)] text-[var(--tf-teal)]",
        };

  return (
    <>
      {/* Always-visible ticking countdown chip when browsing elsewhere */}
      <div className="pointer-events-none fixed inset-x-0 top-[76px] z-30 flex justify-center px-3 md:justify-end md:px-6">
        <Link
          href="/warenkorb"
          className={`pointer-events-auto mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold shadow-[0_8px_24px_rgba(15,39,71,0.12)] transition hover:scale-[1.02] ${
            countdown?.critical
              ? "border-[var(--tf-action-border)] bg-[var(--tf-action-bg)] text-[var(--tf-navy)]"
              : countdown?.urgent
                ? "border-[rgba(15,39,71,0.14)] bg-white text-[var(--tf-navy)]"
                : "border-[var(--tf-line)] bg-white text-[var(--tf-navy)]"
          }`}
          aria-live="polite"
        >
          <Clock className="h-4 w-4" strokeWidth={2} aria-hidden />
          <span className="tabular-nums tracking-wide">
            {countdown?.expired ? "Abgelaufen" : (countdown?.label ?? "—:—")}
          </span>
          <span className="hidden text-xs font-medium opacity-70 sm:inline">Reservierung</span>
        </Link>
      </div>

      {showPanel ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-6 md:left-6 md:right-auto md:w-full md:max-w-md"
          role="alertdialog"
          aria-live="assertive"
          aria-modal="false"
        >
          <div
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-[0_12px_40px_rgba(15,39,71,0.18)] ${milestoneTone.shell}`}
          >
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${milestoneTone.icon}`}
            >
              {activeMilestone === "soft" ? (
                <ShoppingCart className="h-5 w-5" strokeWidth={2} />
              ) : (
                <Clock className="h-5 w-5" strokeWidth={2} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--tf-navy)]">{title}</p>
                {countdown && !countdown.expired ? (
                  <p className="text-lg font-bold tabular-nums text-[var(--tf-navy)]">
                    {countdown.label}
                  </p>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-[var(--tf-text-secondary)]">{body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/checkout" className="tf-btn tf-btn-primary !min-h-9 !px-3 text-sm">
                  Zur Kasse
                </Link>
                <Link href="/warenkorb" className="tf-btn tf-btn-secondary !min-h-9 !px-3 text-sm">
                  Warenkorb öffnen
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg p-1 text-[var(--tf-text-secondary)] hover:bg-[var(--tf-overlay)] hover:text-[var(--tf-navy)]"
              aria-label="Erinnerung schließen"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
