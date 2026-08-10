import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkStatusBadge, ReviewStatusBadge } from "@/components/ui/StatusBadge";
import { FINANCIAL_TYPES } from "@/lib/enums";

interface Filters {
  dateFrom?: string; dateTo?: string; direction?: string; linked?: string; reviewStatus?: string; financialType?: string;
}

export default async function TransactionsPage({ searchParams }: { searchParams: Filters }) {
  const where: Record<string, unknown> = { status: "ACTIVE" };
  if (searchParams.direction) where.direction = searchParams.direction;
  if (searchParams.reviewStatus) where.reviewStatus = searchParams.reviewStatus;
  if (searchParams.financialType) where.financialType = searchParams.financialType;
  if (searchParams.linked === "unlinked") { where.clientId = null; where.matterId = null; }
  if (searchParams.linked === "linked") { where.OR = [{ clientId: { not: null } }, { matterId: { not: null } }]; }
  if (searchParams.dateFrom || searchParams.dateTo) {
    where.transactionDate = {
      gte: searchParams.dateFrom ? new Date(searchParams.dateFrom) : undefined,
      lte: searchParams.dateTo ? new Date(searchParams.dateTo) : undefined,
    };
  }

  const transactions = await prisma.financialTransaction.findMany({
    where,
    orderBy: { transactionDate: "desc" },
    take: 150,
    include: { client: { select: { name: true } }, matter: { select: { matterName: true } } },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Financial Transactions</h1>
        <p className="text-sm text-muted">Menampilkan 150 transaksi terbaru sesuai filter. Gunakan Search (⌘K) untuk mencari transaksi spesifik.</p>
      </div>

      <form action="/transactions" method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4">
        <FilterField label="Dari"><input type="date" name="dateFrom" defaultValue={searchParams.dateFrom} className="input" /></FilterField>
        <FilterField label="Sampai"><input type="date" name="dateTo" defaultValue={searchParams.dateTo} className="input" /></FilterField>
        <FilterField label="Direction">
          <select name="direction" defaultValue={searchParams.direction ?? ""} className="input">
            <option value="">Semua</option><option value="IN">IN</option><option value="OUT">OUT</option>
          </select>
        </FilterField>
        <FilterField label="Link Status">
          <select name="linked" defaultValue={searchParams.linked ?? ""} className="input">
            <option value="">Semua</option><option value="linked">Linked</option><option value="unlinked">Unlinked</option>
          </select>
        </FilterField>
        <FilterField label="Review Status">
          <select name="reviewStatus" defaultValue={searchParams.reviewStatus ?? ""} className="input">
            <option value="">Semua</option><option value="NORMAL">Normal</option><option value="WARNING">Warning</option><option value="REVIEW_REQUIRED">Review Required</option>
          </select>
        </FilterField>
        <FilterField label="Financial Type">
          <select name="financialType" defaultValue={searchParams.financialType ?? ""} className="input">
            <option value="">Semua</option>
            {FINANCIAL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </FilterField>
        <button type="submit" className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">Filter</button>
        <a href="/transactions" className="rounded-control border border-border px-4 py-2 text-sm hover:bg-bg">Reset</a>
      </form>

      <Card>
        <CardBody className="p-0">
          {transactions.length === 0 ? (
            <EmptyState title="Belum ada transaksi" description="Tambahkan transaksi pertama untuk mulai mencatat aktivitas finansial." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Transaction ID</th>
                    <th className="px-5 py-3">Direction</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Matter</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Link Status</th>
                    <th className="px-5 py-3">Review</th>
                    <th className="px-5 py-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3 whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted">{t.id.slice(0, 8)}</td>
                      <td className="px-5 py-3">{t.direction}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(t.amount)}</td>
                      <td className="px-5 py-3"><a href={`/transactions/${t.id}`} className="font-medium text-text hover:text-primary">{t.description}</a></td>
                      <td className="px-5 py-3 text-muted">{t.client?.name ?? "-"}</td>
                      <td className="px-5 py-3 text-muted">{t.matter?.matterName ?? "-"}</td>
                      <td className="px-5 py-3 text-muted">{t.financialType}</td>
                      <td className="px-5 py-3"><LinkStatusBadge status={!t.clientId ? "UNLINKED" : !t.matterId ? "LINKED_TO_CLIENT" : "LINKED_TO_MATTER"} /></td>
                      <td className="px-5 py-3"><ReviewStatusBadge status={t.reviewStatus as "NORMAL" | "WARNING" | "REVIEW_REQUIRED"} /></td>
                      <td className="px-5 py-3 text-muted">{t.sourceType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}
