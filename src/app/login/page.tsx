"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BRANDING_DEFAULTS, accentClassName, brandingImageUrl, type BrandingSettings } from "@/lib/branding";

interface StaffOption {
  id: string;
  name: string;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Initial state already equals the shared defaults (same constants the
  // server-rendered Dashboard falls back to), so there's no flash of
  // different content before the fetch below resolves — it only changes
  // anything if staff have actually customized branding in Settings.
  const [branding, setBranding] = useState<BrandingSettings>(BRANDING_DEFAULTS);

  useEffect(() => {
    fetch("/api/auth/staff")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setStaff(json.data);
          if (json.data.length > 0) setStaffId(json.data[0].id);
        }
      });
    // Public endpoint (no session needed) — same pattern as /api/auth/staff
    // above, since this page renders before login.
    fetch("/api/settings/branding")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setBranding(json.data);
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!staffId) throw new Error("Pilih staf terlebih dahulu.");
      if (!pin.trim()) throw new Error("Masukkan PIN terlebih dahulu.");
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, pin }),
      });
      const json = await res.json().catch(() => null);
      if (!json) throw new Error("Terjadi kesalahan saat masuk. Silakan coba lagi.");
      if (!json.success) throw new Error(json.message || "PIN tidak sesuai. Silakan coba lagi.");
      router.push(searchParams.get("next") || "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Brand/hero panel — hidden below md so the login form stays the
          priority on small screens (Step 3: mobile must not overflow, hero
          may shrink or hide entirely). */}
      <div className={`relative hidden md:flex md:w-2/5 lg:w-1/2 flex-col justify-center overflow-hidden px-10 lg:px-16 py-12 ${accentClassName(branding.branding_accent)}`}>
        {branding.branding_login_image && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${brandingImageUrl("login")})` }}
              aria-hidden="true"
            />
            <div className={`absolute inset-0 opacity-60 ${accentClassName(branding.branding_accent)}`} aria-hidden="true" />
          </>
        )}
        <div className="relative mx-auto w-full max-w-sm">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 8h7M9 12h7" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-white text-3xl lg:text-4xl font-semibold tracking-tight leading-tight">
            {branding.branding_login_title}
          </h1>
          <p className="mt-4 text-white/70 text-sm lg:text-base">
            {branding.branding_login_subtitle}
          </p>
        </div>
      </div>

      {/* Login form panel */}
      <div className="flex flex-1 items-center justify-center bg-bg px-4 py-12 md:px-10">
        <div className="w-full max-w-sm">
          {/* Compact brand mark, mobile-only (hero panel above is hidden below md) */}
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${accentClassName(branding.branding_accent)}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 8h7M9 12h7" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-text">{branding.branding_login_title}</span>
          </div>

          <h2 className="text-2xl font-semibold text-text mb-1">Selamat Datang</h2>
          <p className="text-sm text-muted mb-8">Masuk untuk mengakses Notary Financial Control.</p>

          <form onSubmit={submit} className="bg-card rounded-card p-8 shadow-xl border border-border">
            <label className="block text-sm font-medium text-text mb-1">Staf</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full mb-4 rounded-control border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {staff.length === 0 && <option value="">Memuat...</option>}
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <label className="block text-sm font-medium text-text mb-1">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              aria-label="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full mb-4 rounded-control border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              autoFocus
            />

            {error && (
              <p role="alert" className="text-sm text-danger mb-4">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !staffId}
              className="w-full rounded-control bg-primary py-3 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {busy ? "Memproses..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
