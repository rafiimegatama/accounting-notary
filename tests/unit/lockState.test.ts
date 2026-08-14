import { describe, it, expect, beforeEach } from "vitest";
import { readLockState, writeLock, clearLock, consumeTimeoutNoticePending } from "@/lib/lockState";

// Minimal in-memory Storage fake — no jsdom needed, just the subset of the
// Storage interface this module actually calls.
function createFakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("lockState", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("readLockState() on empty storage is unlocked with no reason", () => {
    expect(readLockState(storage)).toEqual({ locked: false, reason: null });
  });

  it("writeLock(MANUAL) sets locked with reason MANUAL, no pending notice", () => {
    writeLock(storage, "MANUAL");
    expect(readLockState(storage)).toEqual({ locked: true, reason: "MANUAL" });
    expect(consumeTimeoutNoticePending(storage)).toBe(false);
  });

  it("writeLock(TIMEOUT) sets locked with reason TIMEOUT and a pending notice", () => {
    writeLock(storage, "TIMEOUT");
    expect(readLockState(storage)).toEqual({ locked: true, reason: "TIMEOUT" });
    expect(consumeTimeoutNoticePending(storage)).toBe(true);
  });

  it("consumeTimeoutNoticePending() is a true, one-shot read — returns false on the second call", () => {
    writeLock(storage, "TIMEOUT");
    expect(consumeTimeoutNoticePending(storage)).toBe(true);
    expect(consumeTimeoutNoticePending(storage)).toBe(false);
  });

  it("a page-refresh-style re-read after the notice is consumed still reports locked/TIMEOUT, just no pending notice", () => {
    writeLock(storage, "TIMEOUT");
    consumeTimeoutNoticePending(storage);
    expect(readLockState(storage)).toEqual({ locked: true, reason: "TIMEOUT" });
    expect(consumeTimeoutNoticePending(storage)).toBe(false);
  });

  it("clearLock() returns to the unlocked state and does not leave a stale pending notice behind", () => {
    writeLock(storage, "TIMEOUT");
    clearLock(storage);
    expect(readLockState(storage)).toEqual({ locked: false, reason: null });
  });

  it("locking again with MANUAL after a TIMEOUT lock does not resurrect the old pending notice", () => {
    writeLock(storage, "TIMEOUT");
    clearLock(storage);
    writeLock(storage, "MANUAL");
    expect(consumeTimeoutNoticePending(storage)).toBe(false);
  });
});
