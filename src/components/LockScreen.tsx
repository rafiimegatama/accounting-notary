"use client";

import { useEffect, useState } from "react";

// Section 23: convenience screen-lock for a shared office terminal, not a
// second authentication factor — the real session cookie stays valid
// server-side while locked. Re-entering the PIN via /api/auth/verify-pin
// just clears the client-side overlay.
const LOCK_KEY = "notary_locked";

export function useLock() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setLocked(sessionStorage.getItem(LOCK_KEY) === "1");
  }, []);

  function lock() {
    sessionStorage.setItem(LOCK_KEY, "1");
    setLocked(true);
  }
  function unlock() {
    sessionStorage.removeItem(LOCK_KEY);
    setLocked(false);
  }

  return { locked, lock, unlock };
}

export function LockOverlay({ staffName, onUnlock }: { staffName: string; onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      onUnlock();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/95 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-sm rounded-card bg-card p-8 border border-border shadow-lg">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-center text-sm text-muted mb-1">Layar terkunci</p>
        <p className="text-center font-medium text-text mb-6">{staffName}</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full mb-4 rounded-control border border-border px-3 py-2 text-sm text-center focus:border-primary focus:outline-none"
          placeholder="PIN"
        />
        {error && <p className="text-sm text-danger mb-4 text-center">{error}</p>}
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
