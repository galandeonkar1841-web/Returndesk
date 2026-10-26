import { ok, readJson, route } from "@/lib/http/handler";
import * as service from "@/lib/services/requests";
import { createRequestSchema, listQuerySchema } from "@/lib/validation";

export const GET = route(async (req) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  // Treat empty filters (?status=) as "not provided".
  for (const key of Object.keys(params)) if (params[key] === "") delete params[key];
  const query = listQuerySchema.parse(params);
  const { items, meta } = await service.listRequests(query);
  return ok(items, 200, meta);
});

export const POST = route(async (req) => {
  const input = createRequestSchema.parse(await readJson(req));
  const created = await service.createRequest(input);
  return ok(created, 201);
});
