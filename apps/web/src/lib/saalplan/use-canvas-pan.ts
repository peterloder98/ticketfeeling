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

/**
 * Map-style pan for scrollable saalplan canvases.
 * - Drag empty background (not `[data-saalplan-interactive]`) → pan
 * - Space / Alt / middle-mouse → pan even over interactive seats/blocks
 * Seat click-to-assign stays intact when the pointer doesn't drag.
 */
export function useCanvasPan(canvasRef: RefObject<HTMLDivElement | null>) {
  const sessionRef = useRef<PanSession | null>(null);
  const spaceDownRef = useRef(false);
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
      if (!forcePan && onInteractive) return;

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
    [canvasRef],
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

  return {
    panning,
    /** True while Space is held (for callers that should defer object drag). */
    isSpacePan: () => spaceDownRef.current,
    panHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
