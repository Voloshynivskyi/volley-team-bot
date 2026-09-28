/** Мінімальна типізація Telegram WebApp SDK — тільки те, що використовуємо. */
export type TgWebApp = {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name: string; language_code?: string } };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(v: string): boolean;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  openLink(url: string, opts?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  showAlert?(message: string, cb?: () => void): void;
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export function tg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function initData(): string {
  return tg()?.initData ?? "";
}

export function haptic(kind: "light" | "medium" | "success" | "error" | "select") {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === "success" || kind === "error") h.notificationOccurred(kind);
    else if (kind === "select") h.selectionChanged();
    else h.impactOccurred(kind);
  } catch {
    /* старі клієнти */
  }
}

export function confirmDialog(message: string): Promise<boolean> {
  const w = tg();
  if (w?.showConfirm && w.isVersionAtLeast("6.2")) {
    return new Promise((resolve) => w.showConfirm!(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}

export function openLink(url: string) {
  const w = tg();
  if (w) w.openLink(url);
  else window.open(url, "_blank", "noopener");
}
