# Testing Standard

## 1. Core Principle: Real Database, Never Mocked

Every test in `tests/scenarios/` runs against a real, freshly-reset PostgreSQL database via
Docker — not an in-memory substitute, not a mocked Prisma client. This is a deliberate,
already-validated choice, not an oversight:

- `DELETE` is trigger-blocked on every financial table by design (`PROJECT_RULES.md` constraint
  5), which means row-level cleanup between test runs is impossible even if you wanted it. The
  test database is dropped and recreated instead (`scripts/reset-test-db.sh`) — DDL bypasses the
  DML-level trigger, giving each run a genuinely clean slate without weakening the guarantee for
  the real app.
- Route handlers are called directly (`tests/helpers/callApi.ts`), not mocked or reimplemented —
  tests exercise the actual production code path: validation, audit logging, real signed-cookie
  session verification. A test that mocks the database or bypasses auth would pass even if the
  real code path were broken — that already happened once with the audit-trail gap found in Step
  22, which is exactly the kind of bug real-DB testing catches and a mocked test would miss.

**Do not introduce a mocked database or an in-memory Prisma substitute for these tests.** If a
test is slow, that's a reason to reduce the number of scenario tests, not to fake the database.

## 2. Test Types

| Type | Location | What it exercises |
|---|---|---|
| Scenario tests | `tests/scenarios/` | Full route-handler-to-database flows, numbered to match the discovery pain points / master prompt scenarios they verify |
| Unit tests | `tests/unit/` | Pure functions with no DB dependency (`formatCurrency`, `timelineLabel`) |

## 3. Writing a Scenario Test

```ts
import { call } from "../helpers/callApi";
import { POST as createClient } from "@/app/api/clients/route";

describe("Scenario N — <plain description of the behavior being verified>", () => {
  it("<specific assertion in one sentence>", async () => {
    const { status, json } = await call(createClient, {
      method: "POST",
      body: { name: "..." },
    });
    expect(status).toBe(201);
    expect(json.data.clientId).toBeNull(); // e.g. asserting UNLINKED stays valid
  });
});
```

- Import the actual route handler function (`POST`, `GET`, etc.) — never reimplement the logic
  being tested.
- `call()` builds a real signed session cookie by default (`tests/helpers/callApi.ts`); pass
  `unauthenticated: true` specifically to test the 401 path, not as a default.
- Describe blocks are numbered/named after the behavior or discovery pain point they verify, not
  after the function under test — this file doubles as living documentation of validated
  behavior (see the existing 14 master-prompt scenarios for the pattern).

## 4. What Requires a New/Updated Test

- Any new mutation route (create/update/void/link/allocate/reverse/classify).
- Any change to a formula in `src/lib/position.ts` — assert the exact expected numbers, not just
  "doesn't throw."
- Any change to `src/lib/exceptionRules.ts` classification logic (NORMAL/WARNING/REVIEW_REQUIRED)
  — this is exactly the kind of business rule where a silent regression is expensive.
- Any bug fix: add a regression test that would have failed before the fix (see the audit-trail
  gap fixes in v3/v4 — both landed with a new test proving the fix, not just a claim).

Pure UI/styling changes with no behavior change don't require a new test.

## 5. Running Tests

```bash
npm test    # runs scripts/reset-test-db.sh (pretest hook) then vitest run
```

Requires a running Postgres via `docker compose` (the `pretest` script execs into the `db`
container). This is why tests can't run in an environment without Docker — see `DEPLOYMENT.md`.

## 6. Definition of Done for QA sign-off

- `npm test` passes, 0 failures.
- `npm run build` passes (also runs TypeScript typecheck).
- `npm run lint` passes with 0 warnings.
- New/changed mutation routes have scenario coverage per §4.
- If the change touches financial figures, the QA agent manually verifies at least one real
  computed number against the formula in `SYSTEM_OVERVIEW.md §4`, not just "test passed."
