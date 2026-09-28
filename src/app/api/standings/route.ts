import { handle, json } from "@/lib/api";
import { requireViewer } from "@/lib/auth";
import { seasonMvp } from "@/lib/mvp";
import { standingsViews } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireViewer(req);
  const [leagues, mvp] = await Promise.all([standingsViews(), seasonMvp()]);
  return json({ leagues, mvp });
});
