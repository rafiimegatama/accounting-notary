"use client";

import { createContext, useCallback, useContext, useState } from "react";

// Section 24: clear success/warning/error feedback, never raw
// Prisma/SQL/stack traces (callers pass the human-readable message already
// produced by apiFetch/ApiError — see src/lib/apiResponse.ts).
type ToastKind = "success" | "warning" | "error" | "info";
interface ToastCta {
  label: string;
  href: string;
}
interface ToastOptions {
  next?: string;
  cta?: ToastCta[];
}
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  next?: string;
  cta?: ToastCta[];
}

const ToastContext = createContext<{ show: (kind: ToastKind, message: string, options?: ToastOptions) => void } | null>(null);

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-success/30 bg-success-bg text-success",
  warning: "border-warning/30 bg-warning-bg text-warning",
  error: "border-danger/30 bg-danger-bg text-danger",
  info: "border-primary/30 bg-blue-50 text-primary",
};

// Objective P1 "Success → Next Action": `options` is additive — every
// pre-existing 2-arg show(kind, message) call site keeps compiling and
// behaving exactly as before (options undefined → next/cta both undefined).
// next/cta are only ever attached to `success` toasts (error/warning/info
// feedback is unchanged, per task scope) — enforced here once, not by
// trusting every call site, so a stray options object on a non-success
// toast can never leak a CTA. Auto-dismiss extends 5000ms → 8000ms only
// when there's something extra to read/click.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((kind: ToastKind, message: string, options?: ToastOptions) => {
    const id = Date.now() + Math.random();
    const next = kind === "success" ? options?.next : undefined;
    const cta = kind === "success" ? options?.cta : undefined;
    setToasts((prev) => [...prev, { id, kind, message, next, cta }]);
    const duration = next || (cta && cta.length > 0) ? 8000 : 5000;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-control border px-4 py-2.5 text-sm shadow-md ${KIND_STYLES[t.kind]}`}>
            {t.message}
            {t.next && <p className="mt-1 text-xs opacity-90">{t.next}</p>}
            {t.cta && t.cta.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {t.cta.map((c) => (
                  <a key={c.href} href={c.href} className="mt-1.5 inline-block text-xs font-medium underline">
                    {c.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.show;
}
