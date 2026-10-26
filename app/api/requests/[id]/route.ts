import { ok, parseId, readJson, route } from "@/lib/http/handler";
import * as service from "@/lib/services/requests";
import { updateRequestSchema } from "@/lib/validation";

export const GET = route(async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await service.getRequest(parseId(id)));
});

export const PATCH = route(async (req, ctx) => {
  const { id } = await ctx.params;
  const patch = updateRequestSchema.parse(await readJson(req));
  return ok(await service.updateRequest(parseId(id), patch));
});

export const DELETE = route(async (_req, ctx) => {
  const { id } = await ctx.params;
  await service.removeRequest(parseId(id));
  return new Response(null, { status: 204 });
});
