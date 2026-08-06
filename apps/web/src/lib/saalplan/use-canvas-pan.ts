"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const PAN_THRESHOLD_PX = 4;

type PanSession = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  moved: boolean;
};

type Options = {
  /**
   * When true, drag-to-pan works over interactive seats too.
   * Click vs drag is distinguished by movement threshold (seat tap stays intact).
   * Keep false for the admin editor so object drag is unaffected.
   */
  panOverInteractive?: boolean;
};

/**
 * Map-style pan for scrollable saalplan canvases.
 * - Drag empty background (not `[data-saalplan-interactive]`) → pan
 * - Space / Alt / middle-mouse → pan even over interactive seats/blocks
 * - With `panOverInteractive`: drag anywhere on the plan; short taps still select
 */
export function useCanvasPan(
  canvasRef: RefObject<HTMLDivElement | null>,
  options?: Options,
) {
  const panOverInteractive = options?.panOverInteractive ?? false;
  const sessionRef = useRef<PanSession | null>(null);
  const spaceDownRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      spaceDownRef.current = true;
      e.preventDefault();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") spaceDownRef.current = false;
    }
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const endPan = useCallback(() => {
    if (!sessionRef.current) return;
    if (sessionRef.current.moved) {
      suppressClickRef.current = true;
    }
    sessionRef.current = null;
    setPanning(false);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = canvasRef.current;
      if (!el) return;
      const forcePan = spaceDownRef.current || e.altKey || e.button === 1;
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as Element | null;
      const onInteractive = Boolean(target?.closest?.("[data-saalplan-interactive]"));
      if (!forcePan && onInteractive && !panOverInteractive) return;

      if (e.button === 1 || spaceDownRef.current) e.preventDefault();

      sessionRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        moved: false,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [canvasRef, panOverInteractive],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const session = sessionRef.current;
      const el = canvasRef.current;
      if (!session || session.pointerId !== e.pointerId || !el) return;
      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      if (!session.moved) {
        if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
        session.moved = true;
        setPanning(true);
      }
      el.scrollLeft = session.scrollLeft - dx;
      el.scrollTop = session.scrollTop - dy;
      e.preventDefault();
    },
    [canvasRef],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      const el = canvasRef.current;
      try {
        el?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      endPan();
    },
    [canvasRef, endPan],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    panning,
    /** True while Space is held (for callers that should defer object drag). */
    isSpacePan: () => spaceDownRef.current,
    panHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  };
}
