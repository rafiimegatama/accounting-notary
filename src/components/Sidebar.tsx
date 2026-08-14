"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Same client-only-preference philosophy as LockScreen's sessionStorage
// (see docs/PROJECT_MEMORY.md) — read after mount to avoid an SSR/CSR
// mismatch, since localStorage doesn't exist on the server.
const COLLAPSED_KEY = "notary_sidebar_collapsed";

const MENU = [
  { href: "/", label: "Dashboard", icon: DashboardIcon },
  { href: "/guide", label: "Panduan Alur Kerja", icon: GuideIcon },
  { href: "/clients", label: "Clients & Matters", icon: ClientsIcon },
  { href: "/transactions", label: "Transactions", icon: TransactionsIcon },
  { href: "/cost-details", label: "Rincian Biaya", icon: CostIcon },
  { href: "/invoices", label: "Invoices", icon: InvoiceIcon },
  { href: "/payments", label: "Payments", icon: PaymentIcon },
  { href: "/deposits", label: "Deposits", icon: DepositIcon },
  { href: "/disbursements", label: "Disbursements", icon: DisbursementIcon },
  { href: "/review", label: "Review", icon: ReviewIcon },
  { href: "/reports", label: "Reports", icon: ReportIcon },
];

const ADMIN_MENU = [
  { href: "/sources", label: "Sources & Documents", icon: SourceIcon },
  { href: "/audit-log", label: "Audit Log", icon: AuditIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar({ onNewTransaction, className = "" }: { onNewTransaction: () => void; className?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    setCollapsedState(localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  function setCollapsed(next: boolean) {
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    setCollapsedState(next);
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className={`flex h-screen flex-col border-r border-border bg-card transition-all ${collapsed ? "w-16" : "w-64"} ${className}`}>
      {/*
        Root cause of the collapse/expand bug: at w-16 (64px) with px-4
        (32px of padding), the content box is only 32px wide — narrower
        than the 36px logo box alone, before even accounting for the
        toggle button. The overflowing button rendered outside the
        sidebar's visible bounds and got painted over by the main
        content header (later in DOM order, opaque background), making
        it effectively unclickable — collapse worked, expand didn't.
        Fix: collapsed state gets its own single-purpose header (just
        the toggle button, centered, full-width, nothing competing for
        space) instead of trying to cram the same 3-element row into a
        quarter of the space.
      */}
      {collapsed ? (
        <div className="flex justify-center px-2 py-5">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="rounded-md p-2 text-muted hover:bg-bg"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 8h7M9 12h7" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-text">Notary</div>
            <div className="text-xs leading-tight text-muted">Financial Control</div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="ml-auto rounded-md p-1 text-muted hover:bg-bg"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      <div className="px-3">
        <button
          onClick={onNewTransaction}
          className="flex w-full items-center justify-center gap-2 rounded-control bg-primary py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          {!collapsed && "New Transaction"}
        </button>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto px-3">
        <NavGroup label={collapsed ? undefined : "Menu"} items={MENU} isActive={isActive} collapsed={collapsed} />
        <NavGroup label={collapsed ? undefined : "Administration"} items={ADMIN_MENU} isActive={isActive} collapsed={collapsed} className="mt-6" />
      </nav>
    </aside>
  );
}

function NavGroup({
  label,
  items,
  isActive,
  collapsed,
  className = "",
}: {
  label?: string;
  items: typeof MENU;
  isActive: (href: string) => boolean;
  collapsed: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-3 rounded-control px-2.5 py-2 text-sm transition-colors ${
                  active ? "bg-blue-50 font-medium text-primary" : "text-text hover:bg-bg"
                }`}
              >
                {active && collapsed && <span className="absolute -left-3 top-1/2 h-4 -translate-y-1/2 rounded-r bg-primary" style={{ width: 3 }} />}
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Simple line icons (no external icon set needed for these).
function DashboardIcon(p: { className?: string }) { return <Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Icon>; }
function GuideIcon(p: { className?: string }) { return <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" /></Icon>; }
function ClientsIcon(p: { className?: string }) { return <Icon {...p}><circle cx="9" cy="7" r="3" /><path d="M2 21v-1a7 7 0 0 1 14 0v1" /><circle cx="17" cy="8" r="2.5" /><path d="M22 21v-1a5 5 0 0 0-4-4.9" /></Icon>; }
function TransactionsIcon(p: { className?: string }) { return <Icon {...p}><path d="M7 3v18M7 3l-3 3M7 3l3 3" /><path d="M17 21V3M17 21l3-3M17 21l-3-3" /></Icon>; }
function CostIcon(p: { className?: string }) { return <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h10M7 17h6" /></Icon>; }
function InvoiceIcon(p: { className?: string }) { return <Icon {...p}><path d="M6 2h9l3 3v17H6z" /><path d="M15 2v3h3M9 12h6M9 16h6" /></Icon>; }
function PaymentIcon(p: { className?: string }) { return <Icon {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></Icon>; }
function DepositIcon(p: { className?: string }) { return <Icon {...p}><path d="M12 2v14M6 10l6 6 6-6" /><path d="M4 20h16" /></Icon>; }
function DisbursementIcon(p: { className?: string }) { return <Icon {...p}><path d="M12 22V8M6 14l6-6 6 6" /><path d="M4 4h16" /></Icon>; }
function ReviewIcon(p: { className?: string }) { return <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>; }
function ReportIcon(p: { className?: string }) { return <Icon {...p}><path d="M4 19V9M11 19V5M18 19v-7" /></Icon>; }
function SourceIcon(p: { className?: string }) { return <Icon {...p}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 2v7h7" /></Icon>; }
function AuditIcon(p: { className?: string }) { return <Icon {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Icon>; }
function SettingsIcon(p: { className?: string }) { return <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" /></Icon>; }

function Icon({ children, className = "h-4 w-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
