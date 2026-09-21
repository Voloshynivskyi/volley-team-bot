import type { NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError } from "./auth";

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/** Обгортка для route handler: перетворює HttpError/ZodError на нормальні відповіді. */
export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const field = first?.path?.join(".");
        return json({ error: field ? `Поле "${field}": ${first.message}` : "Перевірте поля форми", issues: err.issues }, 400);
      }
      console.error(err);
      return json({ error: "Щось пішло не так на сервері. Спробуйте ще раз." }, 500);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const body = await req.json().catch(() => null);
  return schema.parse(body);
}

export function idParam(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Некоректний id");
  return n;
}
