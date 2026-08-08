/** Structured cart/seat errors that carry UI metadata (unavailable ids, etc.). */
export class CartSeatError extends Error {
  readonly code: string;
  readonly unavailableSeatIds?: string[];
  readonly availableSeatIds?: string[];
  readonly reasons?: Record<string, string>;

  constructor(
    code: string,
    opts?: {
      unavailableSeatIds?: string[];
      availableSeatIds?: string[];
      reasons?: Record<string, string>;
    },
  ) {
    super(code);
    this.name = "CartSeatError";
    this.code = code;
    this.unavailableSeatIds = opts?.unavailableSeatIds;
    this.availableSeatIds = opts?.availableSeatIds;
    this.reasons = opts?.reasons;
  }
}

export function isCartSeatError(error: unknown): error is CartSeatError {
  return error instanceof CartSeatError;
}
