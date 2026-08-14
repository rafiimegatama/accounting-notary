// Baseline security headers (finding #5 from the LAN/WiFi deployment
// architecture review). This is defense-in-depth, not a response to any
// exploited issue — the app has no external script/style/image sources
// (grepped: no next/font, no dangerouslySetInnerHTML, no external <script>,
// no data:/http(s): URLs in src/), so CSP can stay close to `'self'`.
//
// script-src/style-src keep 'unsafe-inline': the App Router streams RSC
// payloads via inline <script> tags at runtime (self.__next_f.push(...)),
// and several components set inline `style={{ width }}` — both would be
// blocked by a strict 'self'-only policy without a per-request nonce, which
// is a larger change (would need middleware.ts to mint a nonce per request
// and thread it through). Not attempted here to avoid shipping an untested
// nonce pipeline — there is no browser tooling in this environment to verify
// it live (same limitation noted elsewhere in this repo, e.g. CHANGELOG.md
// v13/v14/v25). Revisit if a stricter policy is ever required.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // Belt-and-suspenders alongside frame-ancestors above — older
          // browsers that don't honor CSP frame-ancestors still respect this.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing in this app uses camera/mic/geolocation/USB/payment —
          // explicitly deny them rather than leaving the default (allowed
          // for same-origin).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), payment=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
