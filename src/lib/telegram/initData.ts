import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

export type ParsedInitData = {
  user: TelegramUser;
  authDate: Date;
  startParam?: string;
};

const MAX_AGE_SEC = 24 * 3600;

/**
 * Перевірка підпису initData за алгоритмом Telegram:
 * secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
 * hash   = HMAC_SHA256(key=secret, msg=data_check_string)
 */
export function validateInitData(initData: string, botToken: string): ParsedInitData | null {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const authDateRaw = Number(params.get("auth_date"));
  if (!Number.isFinite(authDateRaw)) return null;
  if (Date.now() / 1000 - authDateRaw > MAX_AGE_SEC) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }
  if (typeof user?.id !== "number") return null;

  return {
    user,
    authDate: new Date(authDateRaw * 1000),
    startParam: params.get("start_param") ?? undefined,
  };
}
