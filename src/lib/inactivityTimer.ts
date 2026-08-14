// Pure, framework-agnostic idle timer. Takes timeoutMs as a parameter
// (rather than reading env/config) specifically so tests can inject a
// tiny value directly — no visible production setting, no shortened
// production timeout, per Lock Screen refinement spec constraint.
export const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

export interface InactivityTimer {
  recordActivity: () => void;
  destroy: () => void;
}

export function createInactivityTimer({
  timeoutMs,
  onTimeout,
}: {
  timeoutMs: number;
  onTimeout: () => void;
}): InactivityTimer {
  let handle: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  function arm() {
    if (handle !== null) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = null;
      if (!destroyed) onTimeout();
    }, timeoutMs);
  }

  arm();

  return {
    recordActivity() {
      if (destroyed) return;
      arm();
    },
    destroy() {
      destroyed = true;
      if (handle !== null) clearTimeout(handle);
      handle = null;
    },
  };
}
