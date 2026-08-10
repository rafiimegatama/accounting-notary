"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";

interface SearchResults {
  clients: { id: string; name: string }[];
  matters: { id: string; matterName: string; client: { name: string } }[];
  transactions: { id: string; description: string; amount: string; transactionDate: string; client: { name: string } | null }[];
  invoices: { id: string; invoiceNumber: string; totalAmount: string; matterId: string; matter: { client: { name: string }; matterName: string } }[];
  costDetails: { id: string; description: string; amount: string; matterId: string; matter: { matterName: string } }[];
}

// Section 6: global search, Ctrl/Cmd+K, searches Client/Matter/Transaction/
// Invoice/Cost Detail — reuses the exact /api/search endpoint from Step 18,
// no second search implementation.
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch<SearchResults>(`/api/search?q=${encodeURIComponent(query)}`)
        .then(setResults)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const totalResults = results
    ? results.clients.length + results.matters.length + results.transactions.length + results.invoices.length + results.costDetails.length
    : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full max-w-md items-center gap-2 rounded-control border border-border bg-white px-3 py-2 text-sm text-muted hover:border-primary/50"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <span className="flex-1 text-left">Cari client, matter, transaksi, invoice...</span>
        <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl rounded-card bg-card shadow-lg border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari client, matter, transaksi, invoice, description..."
                className="flex-1 border-none text-sm outline-none"
              />
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {loading && <p className="px-3 py-4 text-sm text-muted">Mencari...</p>}
              {!loading && query.trim().length >= 2 && totalResults === 0 && (
                <p className="px-3 py-4 text-sm text-muted">Tidak ada hasil untuk &quot;{query}&quot;.</p>
              )}
              {results && (
                <>
                  <ResultGroup title="Clients">
                    {results.clients.map((c) => (
                      <ResultRow key={c.id} href={`/clients/${c.id}`} onSelect={() => setOpen(false)} label={c.name} />
                    ))}
                  </ResultGroup>
                  <ResultGroup title="Matters">
                    {results.matters.map((m) => (
                      <ResultRow key={m.id} href={`/matters/${m.id}`} onSelect={() => setOpen(false)} label={m.matterName} sub={m.client.name} />
                    ))}
                  </ResultGroup>
                  <ResultGroup title="Transactions">
                    {results.transactions.map((t) => (
                      <ResultRow
                        key={t.id}
                        href={`/transactions/${t.id}`}
                        onSelect={() => setOpen(false)}
                        label={t.description}
                        sub={`${formatDate(t.transactionDate)} · ${formatCurrency(t.amount)}`}
                      />
                    ))}
                  </ResultGroup>
                  <ResultGroup title="Invoices">
                    {results.invoices.map((inv) => (
                      <ResultRow
                        key={inv.id}
                        href={`/invoices/${inv.id}`}
                        onSelect={() => setOpen(false)}
                        label={inv.invoiceNumber}
                        sub={`${inv.matter.client.name} · ${formatCurrency(inv.totalAmount)}`}
                      />
                    ))}
                  </ResultGroup>
                  <ResultGroup title="Cost Details">
                    {results.costDetails.map((c) => (
                      <ResultRow key={c.id} href={`/matters/${c.matterId}`} onSelect={() => setOpen(false)} label={c.description} sub={formatCurrency(c.amount)} />
                    ))}
                  </ResultGroup>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  if (items.length === 0 || items.every((c) => !c)) return null;
  return (
    <div className="mb-2">
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  );
}

function ResultRow({ href, label, sub, onSelect }: { href: string; label: string; sub?: string; onSelect: () => void }) {
  return (
    <a href={href} onClick={onSelect} className="block rounded-control px-3 py-2 text-sm hover:bg-bg">
      <div className="font-medium text-text">{label}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </a>
  );
}
