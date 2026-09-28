import type { NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { dict, langFromRequest } from "@/lib/i18n";
import { HttpError } from "./auth";

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/** Обгортка для route handler: перетворює HttpError/ZodError на відповіді мовою користувача. */
export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      const t = dict(langFromRequest(req));
      if (err instanceof HttpError) {
        const msg = t.errors[err.key];
        return json({ error: typeof msg === "string" ? msg : t.errors.server }, err.status);
      }
      if (err instanceof ZodError) {
        const field = err.issues[0]?.path?.[0];
        const label = typeof field === "string" ? (t.fields[field] ?? field) : null;
        return json({ error: label ? t.errors.invalidField(label) : t.errors.checkForm, issues: err.issues }, 400);
      }
      console.error(err);
      return json({ error: t.errors.server }, 500);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const body = await req.json().catch(() => null);
  return schema.parse(body);
}

export function idParam(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "badId");
  return n;
}
