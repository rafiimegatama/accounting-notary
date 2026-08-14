// Per-staffId login lockout after repeated failed PIN attempts. Keyed by
// staffId (the credential actually being brute-forced), not by source IP —
// robust against an attacker rotating IPs, and doesn't accidentally lock
// out multiple legitimate staff who happen to share one office egress IP
// through the ngrok tunnel.
//
// Deliberately in-memory, no new dependency, no schema/migration: resets
// on app restart, which only happens at deploy time (infrequent, not
// attacker-controlled) — an acceptable tradeoff for a single-process,
// single-office LOCAL deployment. `now` is injectable so tests don't need
// to wait out a real 5-minute lockout (same testability pattern as
// INACTIVITY_TIMEOUT_MS in src/lib/inactivityTimer.ts).
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

interface AttemptState {
  count: number;
  lockedUntil: number | null;
}

export interface LockoutStatus {
  locked: boolean;
  retryAfterMs: number;
}

export interface LoginAttemptTracker {
  checkLockout: (key: string) => LockoutStatus;
  recordFailure: (key: string) => void;
  recordSuccess: (key: string) => void;
}

export function createLoginAttemptTracker({
  maxAttempts,
  lockoutMs,
  now = () => Date.now(),
}: {
  maxAttempts: number;
  lockoutMs: number;
  now?: () => number;
}): LoginAttemptTracker {
  const attempts = new Map<string, AttemptState>();

  return {
    checkLockout(key) {
      const state = attempts.get(key);
      if (!state?.lockedUntil) return { locked: false, retryAfterMs: 0 };
      const remaining = state.lockedUntil - now();
      if (remaining <= 0) {
        attempts.delete(key);
        return { locked: false, retryAfterMs: 0 };
      }
      return { locked: true, retryAfterMs: remaining };
    },
    recordFailure(key) {
      const state = attempts.get(key) ?? { count: 0, lockedUntil: null };
      state.count += 1;
      if (state.count >= maxAttempts) state.lockedUntil = now() + lockoutMs;
      attempts.set(key, state);
    },
    recordSuccess(key) {
      attempts.delete(key);
    },
  };
}

// Module-level singleton for the real login route — survives Next.js dev
// hot-reload the same way src/lib/prisma.ts's PrismaClient singleton does,
// so an edit-triggered reload mid-testing doesn't quietly reset counts.
const globalForRateLimit = globalThis as unknown as { loginAttemptTracker?: LoginAttemptTracker };

export const loginAttemptTracker: LoginAttemptTracker =
  globalForRateLimit.loginAttemptTracker ??
  createLoginAttemptTracker({ maxAttempts: LOGIN_MAX_ATTEMPTS, lockoutMs: LOGIN_LOCKOUT_MS });

if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.loginAttemptTracker = loginAttemptTracker;
}
