# AUTH UX Refinement Report — Login + Lock Screen + 5-Minute Inactivity

Scope: `REFINEMENT — REDESIGN LOGIN + LOCK SCREEN + 5-MINUTE INACTIVITY` master prompt, Steps 1–17.
"Refine UX, do not re-architect" — no schema, no business logic, no new authentication mechanism.

## 1. Existing Authentication Flow (as found, Step 1)

- **Login**: `src/app/login/page.tsx` fetches staff list, posts `{staffId, pin}` to `POST /api/auth/login`.
- **Session creation**: `/api/auth/login` verifies PIN (scrypt, `src/lib/session.ts`) and sets an
  HMAC-signed, stateless cookie `notary_session` (`httpOnly`, `sameSite: lax`, 12h `maxAge`).
- **Session expiration**: fixed 12h TTL embedded in the cookie payload's `exp`, checked in
  `verifySessionCookieValue()`. Independent of Lock Screen — the cookie is untouched by locking.
- **Inactivity detection**: none existed before this Lock Screen work started (built in an earlier
  session this same project — `src/lib/inactivityTimer.ts` + `useInactivityLock()`).
- **Lock trigger**: manual (header menu) or automatic (5-minute idle timeout), both write to
  `sessionStorage` via `src/lib/lockState.ts` — client-side only, not a real logout.
- **PIN verification**: `LockOverlay` posts to `POST /api/auth/verify-pin`, which re-checks the PIN
  against the same `verifyPin()`/scrypt as login, requiring an already-valid session.
- **Unlock**: clears the `sessionStorage` lock keys. Because locking never navigates (it's a
  full-screen overlay on top of the already-mounted page), unlocking has nothing to "return to" —
  the underlying route was never left.
- **Logout**: separate, explicit — clears the session cookie and redirects to `/login`. Unrelated
  to lock/unlock.

## 2. Files Inspected (read-only, Step 1)

`src/app/login/page.tsx`, `src/app/api/auth/{login,logout,verify-pin}/route.ts`,
`src/lib/{session,currentUser,requireSession}.ts`, `middleware.ts`,
`src/lib/{inactivityTimer,lockState}.ts`, `src/components/{LockScreen,AppShellClient}.tsx`,
`src/app/(app)/layout.tsx`.

## 3. Files Changed

- `src/app/login/page.tsx` — split-screen redesign, hardened error handling, `role="alert"`.
- `src/components/LockScreen.tsx` — copy fixes, background token, dialog semantics, ESC handling,
  `pointerdown` activity tracking, PIN-error resolution extracted to a pure function.
- `src/components/AppShellClient.tsx` — `inert` wrapper so keyboard focus can't escape the lock.
- `src/lib/lockPinError.ts` — **new**, pure `resolveVerifyPinError()`.
- `tests/unit/lockPinError.test.ts` — **new**, 5 tests.

Zero changes to: Prisma schema, any migration, `src/lib/session.ts`, `middleware.ts`,
`/api/auth/*` routes, `exceptionRules.ts`, or any financial/client/matter/invoice/payment/
deposit/disbursement file.

## 4. Login UX Changes (Steps 2–3)

Split-screen layout: dark navy hero panel (`Notary` / `Financial Control`, one short tagline —
hidden below `md:` so mobile isn't cluttered, replaced by a compact inline brand mark) + a
soft-neutral form panel (`Selamat Datang` / `Masuk untuk mengakses Notary Financial Control.`).
The staff-select + PIN authentication mechanism is byte-for-byte the same fields calling the same
`POST /api/auth/login` — only the surrounding layout changed. Error handling hardened: empty
staff/PIN are caught client-side before any network call, and a non-JSON/failed response now falls
back to a clean Indonesian message instead of ever letting a raw parse error reach the screen.

## 5. Lock Screen UX Changes (Steps 4, 7, 12)

STATE B (PIN form) now matches the target mockup exactly: lock icon → "Layar Terkunci" → staff name
→ "Masukkan PIN untuk melanjutkan." (previously missing) → PIN input → "Buka". Background moved
from dark navy to the same soft-neutral `bg-bg` token the login form panel uses (`bg-navy` is now
exclusively the login hero, per Step 12's explicit color mapping), and both lock states now share
one shadow weight with the login card (`shadow-xl`, previously `shadow-lg` on login only — an
inconsistency caught during this pass). The full ACTIVE → 5-min-idle → "Sesi Berakhir" → Mengerti →
PIN form → unlock → same-page-restored sequence was traced against the code and confirmed to
already match the target flow exactly (Step 4) — no structural change was needed there, only the
copy/visual issues below.

## 6. Inactivity Timeout Implementation (Step 5)

Unchanged mechanically from the earlier Lock Screen build: `INACTIVITY_TIMEOUT_MS = 300000`
(exact, no visible production setting), a pure `createInactivityTimer` armed by real `window`
activity listeners, mounted once per authenticated session via `AppShellClient`. Added
`pointerdown` to the tracked events this pass, to explicitly cover the spec's "pointer interaction"
requirement alongside mouse/keyboard/touch. No API polling, no reset from re-renders — confirmed
by reading the code: `recordActivity()` is only ever called from real DOM event listeners.
INACTIVITY LOCK, SESSION EXPIRATION (12h cookie), and LOGOUT remain three separate, non-conflated
mechanisms, as required.

## 7. Unhappy Flow (Step 6)

Fixed a real copy inaccuracy: the modal said *"Anda ter-logout otomatis..."* even though nothing
is logged out — only locked, session cookie untouched. Now reads *"Sesi dikunci karena tidak ada
aktivitas. Masukkan PIN untuk melanjutkan."* — accurate to the actual behavior, per the spec's own
explicit fork between the two options. Added ESC-to-dismiss on this modal only: it reveals the same
PIN form the "Mengerti" button leads to, so the lock is never bypassed by pressing Escape.

## 8. Security Behavior (Step 8)

PIN verification itself is completely untouched — still `POST /api/auth/verify-pin`, still scrypt,
still requires an existing valid session. Only the *displayed* wrong-PIN string changed, client-side:
extracted into `resolveVerifyPinError()` (`src/lib/lockPinError.ts`), which maps the server's
`INVALID_CREDENTIALS` errorCode to the spec's exact "PIN tidak sesuai. Silakan coba lagi." while
passing through the server's own real message for any other failure (most notably an actually-
expired session while locked, which gets its own accurate message rather than a generic one).
Confirmed live that the server's actual response is unchanged (`"PIN salah."`) — the remapping is
purely client-side presentation. No rate-limiting/lockout exists anywhere in the codebase to
preserve (confirmed via inspection in Step 1), so there was nothing to break there.

## 9. Tests

81/81 pass (76 pre-existing + 5 new for `lockPinError.ts`, covering: null/network-failure response,
success, `INVALID_CREDENTIALS` remapped to the spec's copy, a distinct real error kept verbatim,
and a failure with no message falling back to the generic string). Combined with the prior task's
6 `inactivityTimer.ts` tests (exact 300000ms boundary, reset-on-activity, single-fire, `destroy()`)
and 7 `lockState.ts` tests, the deterministic timeout/lock-state logic has direct unit coverage
without any new DOM/UI testing framework, per the spec's own instruction.

## 10. Build / Lint / Typecheck

All clean: `npx tsc --noEmit`, `npm run lint`, `npm test` (81/81), `npm run build` (full production
build, including the `inert` JSX attribute typechecking against this project's React 18.3/TS 5.5
without any type augmentation needed). Live smoke-tested against the dev server + real Postgres
after every step: login round-trip (correct/wrong PIN), dashboard/clients/transactions all 200,
the `inert` wrapper (`class="contents"`) and dialog markup confirmed present in the rendered HTML.

## 11. Known Limitations

- **No browser automation tooling exists in this environment** (no Playwright/Puppeteer/Chromium).
  Every visual/interaction claim (dialog focus behavior, ESC handling, `inert` actually blocking a
  real Tab keypress, mobile layout at real viewport widths) was verified by reading the rendered
  Tailwind/HTML output and tracing the code, not by driving an actual browser. This is the same
  limitation flagged throughout this project's session.
- **Background-tab timer throttling** (Step 11, Case E): browsers may throttle `setTimeout` in
  backgrounded tabs, so the actual lock could fire slightly later than exactly 300s if the tab was
  inactive. Tab-switching itself is never treated as activity (no `visibilitychange` listener), but
  engineering around browser-level timer throttling would add real complexity beyond this refinement's
  scope, so it's documented rather than "fixed."
- **`inert` requires a reasonably modern browser** (Chrome 102+/Firefox 112+/Safari 15.5+) — judged
  acceptable for a LAN-only internal office app per `CLAUDE.md`'s deployment model, no fallback
  focus-trap was hand-rolled on top of it.

## 12. Explicit Confirmation

```
DATABASE SCHEMA:        UNCHANGED
FINANCIAL BUSINESS LOGIC: UNCHANGED
AUTHENTICATION MECHANISM: PRESERVED (staff + PIN, unchanged)
PIN VALIDATION:          PRESERVED (scrypt via src/lib/session.ts, unchanged)
INACTIVITY TIMEOUT:      5 MINUTES (300000ms, exact)
FINAL STATUS:            PASS
```
