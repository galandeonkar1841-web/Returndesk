import { ok, parseId, readJson, route } from "@/lib/http/handler";
import * as service from "@/lib/services/requests";
import { noteSchema } from "@/lib/validation";

export const POST = route(async (req, ctx) => {
  const { id } = await ctx.params;
  const { body, author } = noteSchema.parse(await readJson(req));
  return ok(await service.addNote(parseId(id), body, author), 201);
});
