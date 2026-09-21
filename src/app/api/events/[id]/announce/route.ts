import type { NextRequest } from "next/server";
import { handle, idParam, json } from "@/lib/api";
import { HttpError, requireAdmin } from "@/lib/auth";
import { sendEventPost } from "@/lib/telegram/post";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MESSAGES = {
  sent: "Анонс відправлено в тред.",
  already_sent: "Анонс уже був у треді. Явка в ньому оновлюється автоматично.",
  no_chat: "Група ще не прив'язана. Надішліть /here у потрібному треді.",
} as const;

export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const result = await sendEventPost(id, "announce");
  if (result === "not_found") throw new HttpError(404, "Подію не знайдено");
  return json({ result, message: MESSAGES[result] });
});
