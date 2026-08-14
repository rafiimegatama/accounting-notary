import { searchAll } from "@/lib/search";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

// Step 18 — Search results page. Every row links directly to the actual
// record's own page (client/matter/transaction) — never a dead-end text
// snippet, per the master prompt's explicit requirement.
//
// Phase 7/12 (Phase 2 refinement): restyled onto the same Tailwind design
// system every other page uses — this page was the one holdout still using
// raw inline styles. searchAll() itself already supported grouped results,
// amount, and date matching; nothing about that logic changed here.
export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q ?? "";
  const results = q ? await searchAll(q) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Search</h1>
        <p className="text-sm text-muted">Cari berdasarkan nama client/matter, nomor invoice, deskripsi, jumlah, atau tanggal.</p>
      </div>

      <form action="/search" method="get" className="flex gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari client, matter, invoice, deskripsi, amount, tanggal..."
          className="input flex-1"
        />
        <button type="submit" className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">Cari</button>
      </form>

      {!results ? (
        <p className="text-sm text-muted">Ketik kata kunci untuk mulai mencari.</p>
      ) : results.clients.length + results.matters.length + results.transactions.length + results.invoices.length + results.costDetails.length === 0 ? (
        <EmptyState title="Tidak ada hasil" description={`Tidak ditemukan hasil untuk "${q}".`} />
      ) : (
        <div className="flex flex-col gap-5">
          <ResultSection title="Clients" count={results.clients.length}>
            {results.clients.map((c) => (
              <ResultRow key={c.id} href={`/clients/${c.id}`} primary={c.name} />
            ))}
          </ResultSection>

          <ResultSection title="Matters" count={results.matters.length}>
            {results.matters.map((m) => (
              <ResultRow key={m.id} href={`/matters/${m.id}`} primary={m.matterName} secondary={m.client.name} />
            ))}
          </ResultSection>

          <ResultSection title="Transactions" count={results.transactions.length}>
            {results.transactions.map((t) => (
              <ResultRow
                key={t.id}
                href={`/transactions/${t.id}`}
                primary={`${formatDate(t.transactionDate)} · ${formatCurrency(t.amount)} · ${t.description}`}
                secondary={`${t.client?.name ?? "Unlinked"}${t.matter ? ` / ${t.matter.matterName}` : ""}`}
              />
            ))}
          </ResultSection>

          <ResultSection title="Invoices" count={results.invoices.length}>
            {results.invoices.map((inv) => (
              <ResultRow
                key={inv.id}
                href={`/matters/${inv.matterId}`}
                primary={`${inv.invoiceNumber} · ${formatCurrency(inv.totalAmount)}`}
                secondary={`${inv.matter.client.name} / ${inv.matter.matterName}`}
              />
            ))}
          </ResultSection>

          <ResultSection title="Rincian Biaya" count={results.costDetails.length}>
            {results.costDetails.map((c) => (
              <ResultRow key={c.id} href={`/matters/${c.matterId}`} primary={`${c.description} · ${formatCurrency(c.amount)}`} secondary={c.matter.matterName} />
            ))}
          </ResultSection>
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text">{title} <span className="font-normal text-muted">({count})</span></h2>
      </CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-border">{children}</ul>
      </CardBody>
    </Card>
  );
}

function ResultRow({ href, primary, secondary }: { href: string; primary: string; secondary?: string }) {
  return (
    <li>
      <a href={href} className="block px-5 py-3 text-sm hover:bg-bg">
        <div className="font-medium text-text hover:text-primary">{primary}</div>
        {secondary && <div className="text-xs text-muted">{secondary}</div>}
      </a>
    </li>
  );
}
