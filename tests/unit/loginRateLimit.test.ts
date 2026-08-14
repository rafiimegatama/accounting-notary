import { describe, it, expect } from "vitest";
import { createLoginAttemptTracker } from "@/lib/loginRateLimit";

function trackerWithClock(maxAttempts: number, lockoutMs: number) {
  let t = 0;
  const tracker = createLoginAttemptTracker({ maxAttempts, lockoutMs, now: () => t });
  return { tracker, advance: (ms: number) => (t += ms) };
}

describe("createLoginAttemptTracker", () => {
  it("does not lock out before maxAttempts failures", () => {
    const { tracker } = trackerWithClock(5, 1000);
    for (let i = 0; i < 4; i++) tracker.recordFailure("staff-1");
    expect(tracker.checkLockout("staff-1")).toEqual({ locked: false, retryAfterMs: 0 });
  });

  it("locks out on the Nth failure", () => {
    const { tracker } = trackerWithClock(5, 1000);
    for (let i = 0; i < 5; i++) tracker.recordFailure("staff-1");
    const status = tracker.checkLockout("staff-1");
    expect(status.locked).toBe(true);
    expect(status.retryAfterMs).toBeGreaterThan(0);
  });

  it("auto-unlocks once lockoutMs has elapsed", () => {
    const { tracker, advance } = trackerWithClock(5, 1000);
    for (let i = 0; i < 5; i++) tracker.recordFailure("staff-1");
    expect(tracker.checkLockout("staff-1").locked).toBe(true);
    advance(999);
    expect(tracker.checkLockout("staff-1").locked).toBe(true);
    advance(1);
    expect(tracker.checkLockout("staff-1").locked).toBe(false);
  });

  it("recordSuccess() clears the counter, so a later failure streak starts fresh", () => {
    const { tracker } = trackerWithClock(5, 1000);
    for (let i = 0; i < 4; i++) tracker.recordFailure("staff-1");
    tracker.recordSuccess("staff-1");
    for (let i = 0; i < 4; i++) tracker.recordFailure("staff-1");
    expect(tracker.checkLockout("staff-1").locked).toBe(false);
  });

  it("tracks each staffId independently — locking one never affects another", () => {
    const { tracker } = trackerWithClock(3, 1000);
    for (let i = 0; i < 3; i++) tracker.recordFailure("staff-1");
    expect(tracker.checkLockout("staff-1").locked).toBe(true);
    expect(tracker.checkLockout("staff-2").locked).toBe(false);
  });

  it("re-locks with a fresh window if failures resume right after auto-unlock", () => {
    const { tracker, advance } = trackerWithClock(3, 1000);
    for (let i = 0; i < 3; i++) tracker.recordFailure("staff-1");
    advance(1000);
    expect(tracker.checkLockout("staff-1").locked).toBe(false);
    for (let i = 0; i < 3; i++) tracker.recordFailure("staff-1");
    expect(tracker.checkLockout("staff-1").locked).toBe(true);
  });
});
