"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { tg } from "@/lib/client/tg";

/* ---------- Кнопки ---------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  block?: boolean;
  loading?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  block,
  loading,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium select-none transition-[background-color,transform,opacity] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100";
  const sizes = size === "lg" ? "min-h-12 px-5 text-[17px]" : "min-h-11 px-4 text-[15px]";
  const variants = {
    primary: "bg-court text-white",
    secondary: "bg-court-tint text-court-deep dark:text-court",
    ghost: "bg-transparent text-court",
    danger: "bg-not-tint text-not",
  }[variant];
  return (
    <button
      className={`${base} ${sizes} ${variants} ${block ? "w-full" : ""} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner small /> : children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  const s = small ? "h-4 w-4 border-2" : "h-7 w-7 border-[3px]";
  return (
    <span
      role="status"
      aria-label="Завантаження"
      className={`${s} inline-block animate-spin rounded-full border-current border-r-transparent opacity-70`}
    />
  );
}

/* ---------- Поля форми ---------- */

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-[14px] font-medium text-hint">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-hint">{hint}</span>}
    </label>
  );
}

const fieldClass =
  "w-full min-h-11 rounded-xl bg-field px-3.5 py-2.5 text-[16px] text-ink placeholder:text-hint/70 border border-sep focus:border-court focus:outline-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={`${fieldClass} resize-none ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${fieldClass} appearance-none pr-9 ${props.className ?? ""}`} />
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  tone,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: string }[];
  /** Колір активного сегмента за значенням — для явки. */
  tone?: Partial<Record<T, "going" | "maybe" | "not">>;
}) {
  const toneClass = { going: "bg-going text-white", maybe: "bg-maybe text-white", not: "bg-not text-white" };
  return (
    <div role="radiogroup" className="flex gap-1 rounded-xl bg-field p-1 border border-sep">
      {options.map((o) => {
        const active = o.value === value;
        const t = tone?.[o.value];
        const activeClass = t ? toneClass[t] : "bg-court text-white";
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[15px] font-medium transition-colors ${
              active ? activeClass : "text-ink/80 active:bg-court-tint"
            }`}
          >
            {o.icon && <span aria-hidden>{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-[16px]">{label}</span>
        {hint && <span className="block text-[13px] text-hint">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-7 w-12 rounded-full bg-sep transition-colors peer-checked:bg-going peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-court" />
        <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/* ---------- Секції списку ---------- */

export function Section({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`px-4 ${className}`}>
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between px-1">
          {title && <h2 className="text-[15px] font-medium text-hint">{title}</h2>}
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-surface">{children}</div>
    </section>
  );
}

export function Row({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const cls = `flex w-full items-center gap-3 px-4 py-3 text-left border-b border-sep last:border-b-0 ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} active:bg-court-tint transition-colors`}>
        {children}
      </button>
    );
  }
  return <div className={cls}>{children}</div>;
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[17px] font-medium">{title}</p>
      {text && <p className="mt-1 text-[15px] text-hint">{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed right-4 z-20 flex min-h-12 items-center gap-2 rounded-full bg-court px-5 text-[16px] font-medium text-white shadow-lg shadow-court/30 active:scale-[0.97] transition-transform"
      style={{ bottom: "calc(var(--safe-bottom) + 4.75rem)" }}
    >
      <span aria-hidden className="text-xl leading-none">
        +
      </span>
      {label}
    </button>
  );
}

/* ---------- Bottom sheet з інтеграцією Telegram BackButton ---------- */

// Стек відкритих шитів: кнопка "Назад" у Telegram закриває верхній.
const sheetStack: (() => void)[] = [];
let backHandlerBound = false;

function syncBackButton() {
  const w = tg();
  if (!w) return;
  if (!backHandlerBound) {
    w.BackButton.onClick(() => sheetStack[sheetStack.length - 1]?.());
    backHandlerBound = true;
  }
  if (sheetStack.length) w.BackButton.show();
  else w.BackButton.hide();
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const close = () => closeRef.current();
    sheetStack.push(close);
    syncBackButton();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      const i = sheetStack.indexOf(close);
      if (i >= 0) sheetStack.splice(i, 1);
      syncBackButton();
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button aria-label="Закрити" className="fade-enter absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-enter relative flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-3xl bg-bg"
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-sep absolute left-1/2 top-2 -translate-x-1/2" />
          <h2 className="mt-3 text-[20px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 -mr-2 flex h-9 w-9 items-center justify-center rounded-full text-hint active:bg-court-tint"
            aria-label="Закрити"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">{children}</div>
        {footer && (
          <div
            className="border-t border-sep bg-bg px-4 pt-3"
            style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
          >
            {footer}
          </div>
        )}
        {!footer && <div style={{ height: "var(--safe-bottom)" }} />}
      </div>
    </div>
  );
}

/* ---------- Тости ---------- */

type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(var(--safe-bottom) + 5rem)" }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`fade-enter rounded-xl px-4 py-2.5 text-[15px] text-white shadow-lg ${
              t.tone === "error" ? "bg-not" : "bg-ink/90"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Щось пішло не так";
}
