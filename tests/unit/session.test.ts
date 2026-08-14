import { describe, it, expect, afterEach } from "vitest";
import { createSessionCookieValue, verifySessionCookieValue } from "@/lib/session";

// Regression test for the production incident: SESSION_SECRET was never
// wired into docker-compose.yml's app service, so every page (every one
// calls requireSession() -> verifySessionCookieValue() -> sign()) threw
// "SESSION_SECRET is not set" in production, surfacing to users as
// "Application error: a server-side exception has occurred" (digest
// 3884641326). The actual bug was in docker-compose.yml, not this file —
// session.ts's fail-fast throw is what made the bug loud and diagnosable
// instead of silently producing forgeable/broken sessions. This test locks
// in that fail-fast behavior, plus the correct round-trip once the secret
// is actually present, so a future refactor can't quietly reintroduce a
// silent-failure mode here.
describe("session secret handling", () => {
  const ORIGINAL = process.env.SESSION_SECRET;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = ORIGINAL;
  });

  it("throws a clear error when SESSION_SECRET is missing, instead of silently signing with an empty key", () => {
    delete process.env.SESSION_SECRET;
    expect(() => createSessionCookieValue("staff-1", "Test Staff")).toThrow("SESSION_SECRET is not set.");
  });

  it("signs and verifies a session correctly once SESSION_SECRET is present", () => {
    process.env.SESSION_SECRET = "test-secret-for-this-test-only";
    const value = createSessionCookieValue("staff-1", "Test Staff");
    const payload = verifySessionCookieValue(value);
    expect(payload?.staffId).toBe("staff-1");
    expect(payload?.staffName).toBe("Test Staff");
  });
});
