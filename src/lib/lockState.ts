// Pure sessionStorage read/write logic for the Lock Screen, extracted out
// of the useLock() React hook so it's testable without a DOM — same
// "take the browser API as a parameter" pattern as inactivityTimer.ts.
// Storage here is the standard Storage interface (sessionStorage in the
// browser, a plain in-memory fake in tests).
export type LockReason = "MANUAL" | "TIMEOUT";

export interface LockState {
  locked: boolean;
  reason: LockReason | null;
}

const LOCK_KEY = "notary_locked";
const LOCK_REASON_KEY = "notary_lock_reason";
const TIMEOUT_NOTICE_PENDING_KEY = "notary_timeout_notice_pending";

export function readLockState(storage: Storage): LockState {
  return {
    locked: storage.getItem(LOCK_KEY) === "1",
    reason: (storage.getItem(LOCK_REASON_KEY) as LockReason | null) || null,
  };
}

export function writeLock(storage: Storage, reason: LockReason): void {
  storage.setItem(LOCK_KEY, "1");
  storage.setItem(LOCK_REASON_KEY, reason);
  // Only a timeout-triggered lock owes the user the STATE C "Sesi Berakhir"
  // notice — a manual lock goes straight to the PIN form.
  if (reason === "TIMEOUT") storage.setItem(TIMEOUT_NOTICE_PENDING_KEY, "1");
}

export function clearLock(storage: Storage): void {
  storage.removeItem(LOCK_KEY);
  storage.removeItem(LOCK_REASON_KEY);
  // Defensive: in the wired app the STATE C modal always consumes this on
  // mount before unlock is reachable, but the module shouldn't rely on
  // that caller ordering — clearing it here guarantees no stale pending
  // notice can ever leak into a later, unrelated lock.
  storage.removeItem(TIMEOUT_NOTICE_PENDING_KEY);
}

// Consumed once by the STATE C modal on mount. Clearing it immediately
// means a page refresh while still locked never re-shows the notice —
// it fires exactly once per ACTIVE→LOCKED transition, not once per view.
export function consumeTimeoutNoticePending(storage: Storage): boolean {
  const pending = storage.getItem(TIMEOUT_NOTICE_PENDING_KEY) === "1";
  if (pending) storage.removeItem(TIMEOUT_NOTICE_PENDING_KEY);
  return pending;
}
