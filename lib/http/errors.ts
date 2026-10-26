export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "ILLEGAL_TRANSITION"
  | "DUPLICATE_LIVE_REQUEST"
  | "REQUEST_LOCKED"
  | "NOT_REMOVABLE"
  | "INTERNAL_ERROR";

// One error type for every anticipated failure. The route wrapper turns it
// into the single JSON error shape: { error: { code, message, details? } }.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);
export const validationError = (message: string, details?: unknown) =>
  new AppError(422, "VALIDATION_ERROR", message, details);
export const notFound = (message = "Request not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
