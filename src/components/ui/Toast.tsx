"use client";

import { createContext, useCallback, useContext, useState } from "react";

// Section 24: clear success/warning/error feedback, never raw
// Prisma/SQL/stack traces (callers pass the human-readable message already
// produced by apiFetch/ApiError — see src/lib/apiResponse.ts).
type ToastKind = "success" | "warning" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<{ show: (kind: ToastKind, message: string) => void } | null>(null);

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-success/30 bg-success-bg text-success",
  warning: "border-warning/30 bg-warning-bg text-warning",
  error: "border-danger/30 bg-danger-bg text-danger",
  info: "border-primary/30 bg-blue-50 text-primary",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-control border px-4 py-2.5 text-sm shadow-md ${KIND_STYLES[t.kind]}`}>
            {t.message}
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
