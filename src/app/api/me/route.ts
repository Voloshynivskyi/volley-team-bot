import { getSettings } from "@/db";
import { handle, json } from "@/lib/api";
import { requireViewer } from "@/lib/auth";
import { linkPlayerByTelegram } from "@/lib/events";
import { isLang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const viewer = await requireViewer(req);
  const [settings, player] = await Promise.all([getSettings(), linkPlayerByTelegram(viewer.user)]);
  return json({
    user: viewer.user,
    isAdmin: viewer.isAdmin,
    isMember: viewer.isMember,
    player,
    startParam: viewer.startParam ?? null,
    settings: {
      teamName: settings.teamName,
      timezone: settings.timezone,
      language: isLang(settings.language) ? settings.language : "uk",
      chatBound: settings.chatId != null,
      chatTitle: settings.chatTitle,
      threadId: settings.threadId,
      reminderHours: settings.reminderHours,
      announceDaysBefore: settings.announceDaysBefore,
    },
  });
});
