import { notFound } from "@/lib/http/errors";
import { route } from "@/lib/http/handler";

// Unknown /api paths get the same JSON error shape instead of an HTML 404 page.
const unknown = route(async () => {
  throw notFound("No such API endpoint");
});

export const GET = unknown;
export const POST = unknown;
export const PATCH = unknown;
export const PUT = unknown;
export const DELETE = unknown;
