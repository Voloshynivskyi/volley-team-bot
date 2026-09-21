# Volley Team Bot

Telegram-бот + Mini App для волейбольної команди: склад, розклад ігор і тренувань, явка «іду / не йду», анонси й нагадування в тред групи.

Стек: Next.js 16 (App Router) · grammY · Drizzle ORM · Neon Postgres · Tailwind 4. Розгортається безкоштовно: Vercel Hobby + Neon Free + cron-job.org.

## Як це працює

- **Бот** живе в групі команди (у вибраному треді) і в приватних чатах. Команди: `/next`, `/schedule`, `/roster`, `/here`.
- **Mini App** відкривається кнопкою з бота: розклад, склад, картка події з явкою. Адміністратори групи бачать кнопки редагування.
- **Права**: адміністратори Telegram-групи, прив'язаної через `/here`, + власник з `OWNER_TELEGRAM_ID`. Перевірка — через `getChatAdministrators`, кеш 5 хв.
- **Анонси**: при створенні події (перемикач «Одразу написати анонс») або автоматично за N днів; нагадування за N годин. Усе це робить `/api/cron/reminders`, який зовні пінгує cron-job.org.
- **Явка**: кнопки під анонсом у треді або сегмент у Mini App; список у повідомленні редагується на місці.

## Локальний запуск

```bash
npm i
cp .env.example .env.local   # заповнити
npm run db:push              # створити таблиці в Neon
npm run dev                  # http://localhost:3000
```

Щоб відкрити Mini App у звичайному браузері без Telegram, поставте `DEV_TELEGRAM_USER_ID=<ваш id>` — ви будете адміном. У продакшні змінна ігнорується.

Щоб бот отримував апдейти локально, потрібен HTTPS-тунель (`cloudflared tunnel --url http://localhost:3000` або ngrok). Адресу тунелю запишіть в `APP_URL` і виконайте `npm run bot:webhook`.

## Розгортання (безкоштовно)

### 1. Бот у BotFather

1. `/newbot` → отримати `BOT_TOKEN`.
2. `/mybots` → бот → **Bot Settings → Configure Mini App → Enable Mini App**, вказати `APP_URL`. Без цього кнопка «Відкрити застосунок» у групі не працюватиме (у приватному чаті — працює й так).
3. Дізнатися свій Telegram id (наприклад, через @userinfobot) → `OWNER_TELEGRAM_ID`.

### 2. База даних — Neon

[neon.tech](https://neon.tech) → New project → скопіювати connection string (**pooled**, з `sslmode=require`) → `DATABASE_URL`.

Локально виконати `npm run db:push` з цим `DATABASE_URL`, щоб створити таблиці.

### 3. Vercel

1. Запушити репозиторій на GitHub, імпортувати у [vercel.com](https://vercel.com) (Hobby).
2. Environment Variables: `BOT_TOKEN`, `WEBHOOK_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `APP_URL` (адреса проєкту на Vercel), `OWNER_TELEGRAM_ID`.
   Секрети згенерувати: `openssl rand -hex 24`.
3. Deploy. Після деплою локально з тими ж змінними в `.env.local` виконати `npm run bot:webhook` — це зареєструє вебхук `APP_URL/api/telegram` і меню команд.

### 4. Cron — cron-job.org

Vercel Hobby дозволяє власний cron лише раз на добу, тому нагадування пінгує зовнішній сервіс.

[cron-job.org](https://cron-job.org) → Create cronjob:
- URL: `https://<APP_URL>/api/cron/reminders`
- Schedule: every 10 minutes
- Headers: `Authorization: Bearer <CRON_SECRET>`

Відповідь `{"ok":true,...}` означає, що все працює.

### 5. Прив'язка групи

1. Додати бота в групу команди й зробити адміністратором (щоб бачив адмінів групи і писав у треди).
2. У треді, куди мають приходити анонси, написати `/here`.
3. Відкрити Mini App → «Керування» → перевірити, що група прив'язана, заповнити назву команди, ліги, склад.

## Змінні оточення

| Змінна | Призначення |
|---|---|
| `BOT_TOKEN` | токен від BotFather |
| `WEBHOOK_SECRET` | секрет, яким Telegram підписує вебхук |
| `CRON_SECRET` | Bearer-токен для `/api/cron/reminders` |
| `DATABASE_URL` | Neon Postgres |
| `APP_URL` | публічна адреса застосунку без слеша в кінці |
| `OWNER_TELEGRAM_ID` | ваш id — завжди має повні права |
| `DEV_TELEGRAM_USER_ID` | лише локально: відкривати Mini App без Telegram |

## Структура

```
src/app/api/telegram        вебхук grammY
src/app/api/cron/reminders  прохід крона: анонси + нагадування
src/app/api/*               REST для Mini App (auth через initData у заголовку)
src/lib/telegram/bot.ts     команди й callback-кнопки
src/lib/telegram/post.ts    відправка/оновлення повідомлень у треді
src/lib/telegram/messages   тексти повідомлень
src/lib/events.ts           вибірки подій, явка, прив'язка гравців
src/db/schema.ts            таблиці (players, competitions, events, attendance, posts, settings)
src/components/*            Mini App (React, SWR)
scripts/set-webhook.ts      реєстрація вебхука й команд
```

## Скрипти

- `npm run dev` / `npm run build` / `npm start`
- `npm run db:push` — застосувати схему до БД
- `npm run db:studio` — переглядач даних Drizzle
- `npm run bot:webhook` — поставити вебхук; `-- --delete` — зняти
- `npm run typecheck`, `npm run lint`
