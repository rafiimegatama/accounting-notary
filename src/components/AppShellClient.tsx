"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NewTransactionModal } from "@/components/NewTransactionModal";
import { LockOverlay, useLock } from "@/components/LockScreen";
import { useToast } from "@/components/ui/Toast";

export function AppShellClient({ staffName, reviewCount, children }: { staffName: string; reviewCount: number; children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const { locked, lock, unlock } = useLock();
  const [newTxnOpen, setNewTxnOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen bg-bg">
      <Sidebar onNewTransaction={() => setNewTxnOpen(true)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-4 border-b border-border bg-card px-6 py-3">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <a href="/review" className="relative rounded-control p-2 text-muted hover:bg-bg" aria-label="Review items">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
              {reviewCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">
                  {reviewCount}
                </span>
              )}
            </a>
            <div className="relative">
              <button onClick={() => setUserMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-bg">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs font-medium text-white">
                  {staffName.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm text-text">{staffName}</span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-control border border-border bg-white py-1 shadow-md">
                  <button
                    onClick={() => { setUserMenuOpen(false); lock(); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg"
                  >
                    Lock Screen
                  </button>
                  <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-bg">
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>

      <NewTransactionModal open={newTxnOpen} onClose={() => setNewTxnOpen(false)} />
      {locked && <LockOverlay staffName={staffName} onUnlock={unlock} />}
    </div>
  );
}
