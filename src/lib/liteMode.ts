// Lite Mode: presentation-only preference (currently: hide Dashboard charts
// for a less visually dense view). Deliberately a browser cookie, not a
// Staff/system_setting DB field — per-browser, zero schema/migration
// impact, matching the existing screen-lock pattern's philosophy
// (LockScreen.tsx's sessionStorage) but cookie-based so Server Components
// can read it too (see docs/ROADMAP.md "Lite Mode"). Never used to hide
// review-status flags, audit trail, or drill-down links — those stay
// visible regardless, per CLAUDE.md constraint 4/8.
export const LITE_MODE_COOKIE = "ui_lite_mode";
export const LITE_MODE_ON = "1";
