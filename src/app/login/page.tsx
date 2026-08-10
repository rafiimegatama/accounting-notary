"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

  useEffect(() => {
    fetch("/api/auth/staff")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setStaff(json.data);
          if (json.data.length > 0) setStaffId(json.data[0].id);
        }
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, pin }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      router.push(searchParams.get("next") || "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 8h7M9 12h7" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-white text-xl font-semibold tracking-tight">NOTARY</h1>
          <p className="text-white/70 text-sm">FINANCIAL CONTROL</p>
        </div>

        <form onSubmit={submit} className="bg-card rounded-card p-8 shadow-lg border border-border">
          <h2 className="text-lg font-semibold text-text mb-1">Masuk</h2>
          <p className="text-sm text-muted mb-6">Kelola posisi finansial dan transaksi client secara terpusat.</p>

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
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full mb-4 rounded-control border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            autoFocus
          />

          {error && <p className="text-sm text-danger mb-4">{error}</p>}

          <button
            type="submit"
            disabled={busy || !staffId}
            className="w-full rounded-control bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {busy ? "Memproses..." : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
