"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NewTransactionModal } from "@/components/NewTransactionModal";
import { LockOverlay, useLock, useInactivityLock } from "@/components/LockScreen";
import { LiteModeToggle } from "@/components/LiteModeToggle";
import { useToast } from "@/components/ui/Toast";

export function AppShellClient({
  staffName,
  reviewCount,
  liteMode,
  children,
}: {
  staffName: string;
  reviewCount: number;
  liteMode: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const { locked, reason, lock, unlock, consumeTimeoutNoticePending } = useLock();
  useInactivityLock(locked, lock);
  const [newTxnOpen, setNewTxnOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // The lock overlay's higher z-index already blocks interaction with
  // anything underneath, but the two overlays AppShellClient itself owns
  // (unlike page-level modals, which it has no handle on) are cheap to
  // close outright so they aren't silently still open once unlocked.
  useEffect(() => {
    if (locked) {
      setNewTxnOpen(false);
      setUserMenuOpen(false);
    }
  }, [locked]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    // Cetak Laporan: `h-screen` + `overflow-y-auto` further down (see
    // `main` below) bound the app shell to one viewport-height panel —
    // exactly what a scrollable screen UI needs, but it silently clips
    // `window.print()` output to whatever happened to be scrolled into
    // view. `print:h-auto print:block` here (and the matching overrides on
    // the wrapper + `main` below) let content flow to its natural height so
    // the full report paginates across as many physical pages as it needs.
    <div className="flex h-screen bg-bg print:block print:h-auto">
      {/* z-[100] on LockOverlay already blocks pointer clicks (it covers the
          full viewport), but Tab-order isn't governed by z-index — without
          this, Tab could still cycle focus into the sidebar/header/page
          content underneath. `inert` removes this entire subtree from
          focus, pointer interaction, and the accessibility tree in one
          native attribute while locked, with zero new dependencies. */}
      <div className="contents" inert={locked ? true : undefined}>
        <Sidebar onNewTransaction={() => setNewTxnOpen(true)} className="print:hidden" />

        <div className="flex flex-1 flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
          <header className="flex items-center gap-4 border-b border-border bg-card px-6 py-3 print:hidden">
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-3">
              <LiteModeToggle initialLite={liteMode} />
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
                      onClick={() => { setUserMenuOpen(false); lock("MANUAL"); }}
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

          <main className="flex-1 overflow-y-auto px-6 py-6 print:h-auto print:overflow-visible">{children}</main>
        </div>

        <NewTransactionModal open={newTxnOpen} onClose={() => setNewTxnOpen(false)} />
      </div>
      {locked && (
        <LockOverlay
          staffName={staffName}
          reason={reason}
          consumeTimeoutNoticePending={consumeTimeoutNoticePending}
          onUnlock={unlock}
        />
      )}
    </div>
  );
}
