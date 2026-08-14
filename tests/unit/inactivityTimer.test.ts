import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInactivityTimer } from "@/lib/inactivityTimer";

describe("createInactivityTimer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onTimeout after timeoutMs of no activity", () => {
    const onTimeout = vi.fn();
    createInactivityTimer({ timeoutMs: 1000, onTimeout });
    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("recordActivity() resets the countdown instead of letting it fire", () => {
    const onTimeout = vi.fn();
    const timer = createInactivityTimer({ timeoutMs: 1000, onTimeout });
    vi.advanceTimersByTime(700);
    timer.recordActivity();
    vi.advanceTimersByTime(700);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("fires only once even with no further activity after timeout", () => {
    const onTimeout = vi.fn();
    createInactivityTimer({ timeoutMs: 1000, onTimeout });
    vi.advanceTimersByTime(5000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("destroy() prevents onTimeout from firing", () => {
    const onTimeout = vi.fn();
    const timer = createInactivityTimer({ timeoutMs: 1000, onTimeout });
    vi.advanceTimersByTime(500);
    timer.destroy();
    vi.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("recordActivity() after destroy() is a no-op, does not resurrect the timer", () => {
    const onTimeout = vi.fn();
    const timer = createInactivityTimer({ timeoutMs: 1000, onTimeout });
    timer.destroy();
    timer.recordActivity();
    vi.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("rapid repeated recordActivity() calls collapse into a single re-armed timer, not a stack", () => {
    const onTimeout = vi.fn();
    const timer = createInactivityTimer({ timeoutMs: 1000, onTimeout });
    for (let i = 0; i < 50; i++) {
      vi.advanceTimersByTime(10);
      timer.recordActivity();
    }
    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
