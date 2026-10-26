import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: Ctx) => Promise<Response>;

export function ok<T>(data: T, status = 200, meta?: unknown) {
  return NextResponse.json(meta ? { data, meta } : { data }, { status });
}

function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

function zodDetails(err: ZodError) {
  return err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}

// Wraps every route handler so nothing can ever leak an HTML error page
// or a 200 with an error inside.
export function route(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return errorResponse(err.status, err.code, err.message, err.details);
      }
      if (err instanceof ZodError) {
        return errorResponse(422, "VALIDATION_ERROR", "Some fields are invalid", zodDetails(err));
      }
      console.error("Unhandled error", err);
      return errorResponse(500, "INTERNAL_ERROR", "Something went wrong on our side");
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, "BAD_REQUEST", "Request body must be valid JSON");
  }
}

export function parseId(raw: string): number {
  if (!/^\d+$/.test(raw) || Number(raw) > Number.MAX_SAFE_INTEGER) {
    throw new AppError(400, "BAD_REQUEST", "Request id must be a positive integer");
  }
  return Number(raw);
}
