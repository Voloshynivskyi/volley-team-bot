import type { NextRequest } from "next/server";
import { handle, idParam, json } from "@/lib/api";
import { HttpError, requireAdmin } from "@/lib/auth";
import { dict, langFromRequest } from "@/lib/i18n";
import { sendEventPost } from "@/lib/telegram/post";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const result = await sendEventPost(id, "announce");
  if (result === "not_found") throw new HttpError(404, "eventNotFound");
  return json({ result, message: dict(langFromRequest(req)).announceResult[result] });
});
