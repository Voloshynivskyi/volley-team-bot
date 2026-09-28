import { env } from "@/lib/env";
import type { ErrorKey } from "@/lib/i18n";
import { resolveRole } from "@/lib/telegram/admins";
import { validateInitData, type TelegramUser } from "@/lib/telegram/initData";

export type Viewer = {
  user: TelegramUser;
  isAdmin: boolean;
  /** Учасник групи команди: може додавати гравців і редагувати їхні картки. */
  isMember: boolean;
  startParam?: string;
};

/** Помилка з ключем повідомлення; текст підставляється мовою запиту в handle(). */
export class HttpError extends Error {
  constructor(
    public status: number,
    public key: ErrorKey,
  ) {
    super(key);
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
    return { user: parsed.user, ...(await resolveRole(parsed.user.id)), startParam: parsed.startParam };
  }

  const devId = env.DEV_TELEGRAM_USER_ID;
  if (devId) {
    return { user: { id: devId, first_name: "Dev", username: "dev" }, isAdmin: true, isMember: true };
  }
  return null;
}

export async function requireViewer(req: Request): Promise<Viewer> {
  const v = await getViewer(req);
  if (!v) throw new HttpError(401, "openInTelegram");
  return v;
}

export async function requireMember(req: Request): Promise<Viewer> {
  const v = await requireViewer(req);
  if (!v.isMember) throw new HttpError(403, "membersOnly");
  return v;
}

export async function requireAdmin(req: Request): Promise<Viewer> {
  const v = await requireViewer(req);
  if (!v.isAdmin) throw new HttpError(403, "adminsOnly");
  return v;
}
