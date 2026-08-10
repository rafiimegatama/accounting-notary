import { searchAll } from "@/lib/search";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";

// Step 18 — Search results page. Every row links directly to the actual
// record's own page (client/matter/transaction) — never a dead-end text
// snippet, per the master prompt's explicit requirement.
export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q ?? "";
  const results = q ? await searchAll(q) : null;

  return (
    <div>
      <h1>Search</h1>
      <form action="/search" method="get" style={{ marginBottom: 24 }}>
        <input name="q" defaultValue={q} placeholder="Cari client, matter, invoice, deskripsi, amount, tanggal..." style={{ minWidth: 320 }} />
        <button type="submit">Cari</button>
      </form>

      {!results ? (
        <p style={{ opacity: 0.6 }}>Ketik kata kunci untuk mulai mencari.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <ResultSection title={`Client (${results.clients.length})`}>
            {results.clients.map((c) => (
              <li key={c.id}><a href={`/clients/${c.id}`}>{c.name}</a></li>
            ))}
          </ResultSection>

          <ResultSection title={`Matter (${results.matters.length})`}>
            {results.matters.map((m) => (
              <li key={m.id}><a href={`/matters/${m.id}`}>{m.matterName}</a> <span style={{ opacity: 0.6 }}>— {m.client.name}</span></li>
            ))}
          </ResultSection>

          <ResultSection title={`Financial Transaction (${results.transactions.length})`}>
            {results.transactions.map((t) => (
              <li key={t.id}>
                <a href={`/transactions/${t.id}`}>{formatDate(t.transactionDate)} · {formatCurrency(t.amount)} · {t.description}</a>
                <span style={{ opacity: 0.6 }}> — {t.client?.name ?? "Unlinked"}{t.matter ? ` / ${t.matter.matterName}` : ""}</span>
              </li>
            ))}
          </ResultSection>

          <ResultSection title={`Invoice (${results.invoices.length})`}>
            {results.invoices.map((inv) => (
              <li key={inv.id}>
                <a href={`/matters/${inv.matterId}`}>{inv.invoiceNumber} · {formatCurrency(inv.totalAmount)}</a>
                <span style={{ opacity: 0.6 }}> — {inv.matter.client.name} / {inv.matter.matterName}</span>
              </li>
            ))}
          </ResultSection>

          <ResultSection title={`Cost Detail (${results.costDetails.length})`}>
            {results.costDetails.map((c) => (
              <li key={c.id}>
                <a href={`/matters/${c.matterId}`}>{c.description} · {formatCurrency(c.amount)}</a>
                <span style={{ opacity: 0.6 }}> — {c.matter.matterName}</span>
              </li>
            ))}
          </ResultSection>
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      <ul>{children}</ul>
    </section>
  );
}
