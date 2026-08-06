/**
 * Saalplan view zoom: 100% = readable seat labels (not fit-to-viewport).
 * Fit still exists as a lower zoom factor derived from the viewport.
 */

/** Screen radius (px) we aim for at 100% — numbers stay legible. */
export const TARGET_SEAT_SCREEN_PX = 20;

/** Typical seat cell edge in plan cm (used when no live block size). */
export const REFERENCE_SEAT_CELL_CM = 50;

export const MIN_VIEW_ZOOM = 0.2;
export const MAX_VIEW_ZOOM = 8;
/** Start at 50% of readable scale — still shows seat numbers with label floor. */
export const DEFAULT_VIEW_ZOOM = 0.5;
export const VIEW_ZOOM_STEP = 0.25;

/** px per plan-cm so a typical seat circle is ~TARGET_SEAT_SCREEN_PX. */
export function readableScalePxPerCm(
  seatCellCm: number = REFERENCE_SEAT_CELL_CM,
  targetSeatPx: number = TARGET_SEAT_SCREEN_PX,
): number {
  const rCm = Math.max(3, seatCellCm * 0.34);
  return targetSeatPx / rCm;
}

/** Zoom factor that fits the hall into the padded viewport (usually below 1). */
export function fitViewZoom(fitScale: number, readableScale: number): number {
  if (!(readableScale > 0)) return DEFAULT_VIEW_ZOOM;
  const z = fitScale / readableScale;
  return Math.round(Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, z)) * 100) / 100;
}

export function clampViewZoom(zoom: number): number {
  return Math.round(Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, zoom)) * 100) / 100;
}
