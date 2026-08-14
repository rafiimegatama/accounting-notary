"use client";

import { useEffect, useRef, useState } from "react";
import { createInactivityTimer, INACTIVITY_TIMEOUT_MS } from "@/lib/inactivityTimer";
import {
  type LockReason,
  readLockState,
  writeLock,
  clearLock,
  consumeTimeoutNoticePending as consumeTimeoutNoticePendingFrom,
} from "@/lib/lockState";
import { resolveVerifyPinError } from "@/lib/lockPinError";

// Section 23: convenience screen-lock for a shared office terminal, not a
// second authentication factor — the real session cookie stays valid
// server-side while locked. Re-entering the PIN via /api/auth/verify-pin
// just clears the client-side overlay. Storage read/write logic lives in
// lib/lockState.ts (pure, unit-tested) — this hook is a thin React wrapper.
export type { LockReason };

export function useLock() {
  const [locked, setLocked] = useState(false);
  const [reason, setReason] = useState<LockReason | null>(null);

  useEffect(() => {
    const state = readLockState(sessionStorage);
    setLocked(state.locked);
    setReason(state.reason);
  }, []);

  function lock(lockReason: LockReason = "MANUAL") {
    writeLock(sessionStorage, lockReason);
    setLocked(true);
    setReason(lockReason);
  }
  function unlock() {
    clearLock(sessionStorage);
    setLocked(false);
    setReason(null);
  }
  // Consumed once by the STATE C ("Sesi Berakhir") modal on mount — clearing
  // it immediately means a page refresh while still locked never re-shows
  // the notice, satisfying "shown ONCE per ACTIVE→LOCKED transition."
  function consumeTimeoutNoticePending(): boolean {
    return consumeTimeoutNoticePendingFrom(sessionStorage);
  }

  return { locked, reason, lock, unlock, consumeTimeoutNoticePending };
}

// Watches for real user activity (mouse/keyboard/touch/scroll) anywhere in
// the authenticated app shell and auto-locks after INACTIVITY_TIMEOUT_MS of
// silence. Only armed while unlocked — there is nothing to time out once
// the overlay is already up, and re-arms fresh on unlock.
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "pointerdown", "scroll", "touchstart"] as const;

export function useInactivityLock(locked: boolean, lock: (reason: LockReason) => void) {
  const lockRef = useRef(lock);
  lockRef.current = lock;

  useEffect(() => {
    if (locked) return;

    const timer = createInactivityTimer({
      timeoutMs: INACTIVITY_TIMEOUT_MS,
      onTimeout: () => lockRef.current("TIMEOUT"),
    });
    const recordActivity = () => timer.recordActivity();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    return () => {
      timer.destroy();
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, recordActivity));
    };
  }, [locked]);
}

// z-[100]: every other overlay in the app (NewTransactionModal, GlobalSearch,
// AddCostDetailModal, CreateInvoiceModal, LinkDrawer, TransactionActions)
// uses z-50 — the lock must win even if it fires while one of those is open,
// not rely on DOM-order tie-breaking at the same z-index.
export function LockOverlay({
  staffName,
  reason,
  consumeTimeoutNoticePending,
  onUnlock,
}: {
  staffName: string;
  reason: LockReason | null;
  consumeTimeoutNoticePending: () => boolean;
  onUnlock: () => void;
}) {
  // Lazy initializer runs exactly once, at mount — i.e. exactly once per
  // ACTIVE→LOCKED transition, since this component only mounts when
  // `locked` flips true and unmounts on unlock. A page refresh while still
  // locked re-mounts this with the flag already consumed from the first
  // time, so the notice does not reappear.
  const [showTimeoutNotice, setShowTimeoutNotice] = useState(
    () => reason === "TIMEOUT" && consumeTimeoutNoticePending()
  );
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ESC may dismiss the notice — it only reveals the PIN form underneath,
  // the same screen the "Mengerti" button leads to, so the lock itself is
  // never bypassed.
  useEffect(() => {
    if (!showTimeoutNotice) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowTimeoutNotice(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showTimeoutNotice]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) {
      setError("Masukkan PIN terlebih dahulu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json().catch(() => null);
      const errorMessage = resolveVerifyPinError(json);
      if (errorMessage) {
        setError(errorMessage);
      } else {
        onUnlock();
      }
    } catch {
      setError("Terjadi kesalahan saat memverifikasi PIN. Silakan coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (showTimeoutNotice) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/90 backdrop-blur-md px-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-timeout-title"
          aria-describedby="lock-timeout-desc"
          className="w-full max-w-[420px] rounded-card bg-card p-8 border border-border shadow-xl"
        >
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-danger text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5" strokeLinecap="round" />
              <path d="M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <p id="lock-timeout-title" className="text-center text-lg font-semibold text-text mb-2">Sesi Berakhir</p>
          <p id="lock-timeout-desc" className="text-center text-sm text-muted mb-6">
            Sesi dikunci karena tidak ada aktivitas. Masukkan PIN untuk melanjutkan.
          </p>
          <button
            type="button"
            autoFocus
            onClick={() => setShowTimeoutNotice(false)}
            className="w-full rounded-control bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
          >
            Mengerti
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/90 backdrop-blur-md px-4">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-pin-title"
        className="w-full max-w-[420px] rounded-card bg-card p-8 border border-border shadow-xl"
      >
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
        </div>
        <p id="lock-pin-title" className="text-center text-lg font-semibold text-text mb-1">Layar Terkunci</p>
        <p className="text-center text-sm font-medium text-text mb-1">{staffName}</p>
        <p className="text-center text-sm text-muted mb-6">Masukkan PIN untuk melanjutkan.</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          aria-label="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full mb-4 rounded-control border border-border px-3 py-2 text-sm text-center focus:border-primary focus:outline-none"
          placeholder="PIN"
        />
        {error && (
          <p role="alert" className="text-sm text-danger mb-4 text-center">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-control bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
        >
          {busy ? "Memeriksa..." : "Buka"}
        </button>
      </form>
    </div>
  );
}
