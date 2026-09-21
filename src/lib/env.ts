function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  get BOT_TOKEN() {
    return required("BOT_TOKEN");
  },
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get WEBHOOK_SECRET() {
    return process.env.WEBHOOK_SECRET ?? "";
  },
  get CRON_SECRET() {
    return process.env.CRON_SECRET ?? "";
  },
  get APP_URL() {
    return (process.env.APP_URL ?? "").replace(/\/$/, "");
  },
  get OWNER_TELEGRAM_ID() {
    const v = Number(process.env.OWNER_TELEGRAM_ID);
    return Number.isFinite(v) && v > 0 ? v : null;
  },
  /** Тільки поза продакшном: відкривати Mini App у браузері від імені цього юзера. */
  get DEV_TELEGRAM_USER_ID() {
    if (process.env.NODE_ENV === "production") return null;
    const v = Number(process.env.DEV_TELEGRAM_USER_ID);
    return Number.isFinite(v) && v > 0 ? v : null;
  },
};
