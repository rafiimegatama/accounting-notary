import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TransactionsTable } from "@/components/TransactionsTable";
import { UploadIcon } from "@/components/UploadDocumentModal";
import { FINANCIAL_TYPES, SOURCE_TYPES } from "@/lib/enums";

interface Filters {
  dateFrom?: string; dateTo?: string; direction?: string; linked?: string; reviewStatus?: string; financialType?: string; sourceType?: string;
}

export default async function TransactionsPage({ searchParams }: { searchParams: Filters }) {
  const where: Record<string, unknown> = { status: "ACTIVE" };
  if (searchParams.direction) where.direction = searchParams.direction;
  if (searchParams.reviewStatus) where.reviewStatus = searchParams.reviewStatus;
  if (searchParams.financialType) where.financialType = searchParams.financialType;
  if (searchParams.sourceType) where.sourceType = searchParams.sourceType;
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
    include: { client: { select: { id: true, name: true } }, matter: { select: { id: true, matterName: true } } },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Financial Transactions</h1>
          <p className="text-sm text-muted">Menampilkan 150 transaksi terbaru sesuai filter. Gunakan Search (⌘K) untuk mencari transaksi spesifik.</p>
        </div>
        <a
          href="/transactions/import"
          className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          <UploadIcon />
          Import Excel
        </a>
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
        <FilterField label="Source Type">
          <select name="sourceType" defaultValue={searchParams.sourceType ?? ""} className="input">
            <option value="">Semua</option>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
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
            <TransactionsTable
              rows={transactions.map((t) => ({
                id: t.id,
                transactionDate: t.transactionDate,
                direction: t.direction,
                amount: t.amount,
                description: t.description,
                clientId: t.client?.id ?? null,
                clientName: t.client?.name ?? null,
                matterId: t.matter?.id ?? null,
                matterName: t.matter?.matterName ?? null,
                financialType: t.financialType,
                linkStatus: !t.clientId ? "UNLINKED" : !t.matterId ? "LINKED_TO_CLIENT" : "LINKED_TO_MATTER",
                reviewStatus: t.reviewStatus as "NORMAL" | "WARNING" | "REVIEW_REQUIRED",
                sourceType: t.sourceType,
              }))}
            />
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
