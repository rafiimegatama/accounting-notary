// Pure, import-safe from both server and client code (no prisma import
// here — getBrandingSettings() lives in brandingServer.ts specifically so
// this file can be imported from the client-side login page without
// pulling @prisma/client into the browser bundle).
//
// Deliberately bounded: a fixed set of text fields + a closed set of
// accent color presets + exactly 2 image slots, backed by the existing
// SystemSetting key-value table (0 schema changes). No arbitrary CSS, no
// layout/position fields — this cannot break the hero/login markup, only
// restyle the few pieces that were already dynamic-by-design.
export const BRANDING_TEXT_DEFAULTS = {
  branding_hero_eyebrow: "Notary Financial Control",
  branding_hero_subtitle: "Pantau posisi finansial client dan matter secara terpusat.",
  branding_accent: "navy",
  branding_login_title: "Notary Financial Control",
  branding_login_subtitle: "Pantau posisi finansial client dan matter secara terpusat.",
} as const;

// Image slot values are filenames written by the upload endpoint itself —
// never settable via the generic text POST route (see
// /api/settings/branding vs /api/settings/branding/image). Empty string
// means "no image, fall back to the CSS-only treatment."
export const BRANDING_IMAGE_DEFAULTS = {
  branding_hero_image: "",
  branding_login_image: "",
} as const;

export const BRANDING_DEFAULTS = { ...BRANDING_TEXT_DEFAULTS, ...BRANDING_IMAGE_DEFAULTS };

export type BrandingKey = keyof typeof BRANDING_DEFAULTS;
export const BRANDING_KEYS = Object.keys(BRANDING_DEFAULTS) as BrandingKey[];
export const BRANDING_TEXT_KEYS = Object.keys(BRANDING_TEXT_DEFAULTS) as BrandingKey[];
export type BrandingSettings = Record<BrandingKey, string>;

export type BrandingImageSlot = "hero" | "login";
export const BRANDING_IMAGE_KEY: Record<BrandingImageSlot, BrandingKey> = {
  hero: "branding_hero_image",
  login: "branding_login_image",
};

export function isBrandingImageSlot(value: string): value is BrandingImageSlot {
  return value === "hero" || value === "login";
}

export function brandingImageUrl(slot: BrandingImageSlot): string {
  return `/api/settings/branding/image/${slot}`;
}

export const ACCENT_PRESETS = {
  navy: { label: "Navy", className: "bg-navy" },
  primary: { label: "Primary Blue", className: "bg-primary" },
  slate: { label: "Slate", className: "bg-slate-800" },
} as const;
export type AccentPreset = keyof typeof ACCENT_PRESETS;

export function isAccentPreset(value: string): value is AccentPreset {
  return value in ACCENT_PRESETS;
}

export function accentClassName(value: string): string {
  return isAccentPreset(value) ? ACCENT_PRESETS[value].className : ACCENT_PRESETS.navy.className;
}
