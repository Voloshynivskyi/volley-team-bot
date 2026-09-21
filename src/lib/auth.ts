import { env } from "@/lib/env";
import { isAdmin } from "@/lib/telegram/admins";
import { validateInitData, type TelegramUser } from "@/lib/telegram/initData";

export type Viewer = {
  user: TelegramUser;
  isAdmin: boolean;
  startParam?: string;
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Mini App шле initData в заголовку: Authorization: tma <initData> */
export async function getViewer(req: Request): Promise<Viewer | null> {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, ...rest] = header.split(" ");
  const initData = rest.join(" ");

  if (scheme === "tma" && initData) {
    const parsed = validateInitData(initData, env.BOT_TOKEN);
    if (!parsed) return null;
    return { user: parsed.user, isAdmin: await isAdmin(parsed.user.id), startParam: parsed.startParam };
  }

  const devId = env.DEV_TELEGRAM_USER_ID;
  if (devId) return { user: { id: devId, first_name: "Розробник", username: "dev" }, isAdmin: true };
  return null;
}

export async function requireViewer(req: Request): Promise<Viewer> {
  const v = await getViewer(req);
  if (!v) throw new HttpError(401, "Відкрийте застосунок через Telegram.");
  return v;
}

export async function requireAdmin(req: Request): Promise<Viewer> {
  const v = await requireViewer(req);
  if (!v.isAdmin) throw new HttpError(403, "Редагувати можуть тільки адміністратори групи.");
  return v;
}
