import { ok, parseId, readJson, route } from "@/lib/http/handler";
import * as service from "@/lib/services/requests";
import { transitionSchema } from "@/lib/validation";

export const POST = route(async (req, ctx) => {
  const { id } = await ctx.params;
  const input = transitionSchema.parse(await readJson(req));
  return ok(await service.transitionRequest(parseId(id), input));
});
