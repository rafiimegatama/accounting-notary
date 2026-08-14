import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { compareValues, type SortDir } from "@/lib/listSort";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PaymentStatusBadge } from "@/components/ui/StatusBadge";
import { SortHeader } from "@/components/ui/SortHeader";
import { ClientTypeaheadField } from "@/components/ui/ClientTypeaheadField";

const ZERO = new Prisma.Decimal(0);

interface Filters {
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  paymentStatus?: string;
  aging?: string;
  sort?: string;
  dir?: string;
}

const INVOICE_SORT_KEYS = ["invoiceNumber", "matterName", "clientName", "invoiceDate", "dueDate", "totalAmount", "allocated", "outstanding"] as const;
type InvoiceSortKey = (typeof INVOICE_SORT_KEYS)[number];

const AGING_LABELS: Record<string, string> = {
  current: "Belum Jatuh Tempo",
  "1-30": "Overdue 1-30 Hari",
  "31-60": "Overdue 31-60 Hari",
  "60plus": "Overdue >60 Hari",
  overdue: "Semua Overdue",
};

// Same bucketing as getOutstandingAging() in src/lib/dashboard.ts — kept in
// sync so a bar clicked on the dashboard lands on the matching invoice set.
function agingBucket(outstanding: Prisma.Decimal, dueDate: Date | null, today: Date): string | null {
  if (!outstanding.gt(0)) return null;
  const daysOverdue = dueDate === null || dueDate >= today ? -1 : Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
  if (daysOverdue < 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  return "60plus";
}

export default async function InvoicesPage({ searchParams }: { searchParams: Filters }) {
  const where: Record<string, unknown> = { status: "ISSUED" };
  if (searchParams.clientId) where.matter = { clientId: searchParams.clientId };
  if (searchParams.dateFrom || searchParams.dateTo) {
    where.invoiceDate = {
      gte: searchParams.dateFrom ? new Date(searchParams.dateFrom) : undefined,
      lte: searchParams.dateTo ? new Date(searchParams.dateTo) : undefined,
    };
  }

  const [invoices, selectedClient] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { invoiceDate: "desc" },
      take: 150,
      include: { matter: { include: { client: true } }, allocations: { where: { status: "ACTIVE" } } },
    }),
    searchParams.clientId ? prisma.client.findUnique({ where: { id: searchParams.clientId }, select: { name: true } }) : null,
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = invoices
    .map((inv) => {
      const allocated = inv.allocations.reduce((a, x) => a.add(x.amount), ZERO);
      const outstanding = inv.totalAmount.sub(allocated);
      const paymentStatus = outstanding.lte(0) ? (outstanding.lt(0) ? "OVERPAID" : "PAID") : allocated.gt(0) ? "PARTIALLY_PAID" : "UNPAID";
      return { ...inv, allocated, outstanding, paymentStatus: paymentStatus as "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID" };
    })
    .filter((inv) => !searchParams.paymentStatus || inv.paymentStatus === searchParams.paymentStatus)
    .filter((inv) => {
      if (!searchParams.aging) return true;
      const bucket = agingBucket(inv.outstanding, inv.dueDate, today);
      return searchParams.aging === "overdue" ? bucket !== null && bucket !== "current" : bucket === searchParams.aging;
    });
  const hasFilters = Boolean(searchParams.dateFrom || searchParams.dateTo || searchParams.clientId || searchParams.paymentStatus || searchParams.aging);

  // Sort is opt-in: no sort param leaves the existing invoiceDate-desc
  // (from the Prisma query above) untouched.
  const dir: SortDir = searchParams.dir === "asc" ? "asc" : "desc";
  const sortKey = searchParams.sort && (INVOICE_SORT_KEYS as readonly string[]).includes(searchParams.sort) ? (searchParams.sort as InvoiceSortKey) : null;
  if (sortKey) {
    rows.sort((a, b) => {
      switch (sortKey) {
        case "invoiceNumber":
          return compareValues(a.invoiceNumber, b.invoiceNumber, dir);
        case "matterName":
          return compareValues(a.matter.matterName, b.matter.matterName, dir);
        case "clientName":
          return compareValues(a.matter.client.name, b.matter.client.name, dir);
        case "dueDate":
          return compareValues(a.dueDate?.getTime() ?? 0, b.dueDate?.getTime() ?? 0, dir);
        case "totalAmount":
          return compareValues(Number(a.totalAmount), Number(b.totalAmount), dir);
        case "allocated":
          return compareValues(Number(a.allocated), Number(b.allocated), dir);
        case "outstanding":
          return compareValues(Number(a.outstanding), Number(b.outstanding), dir);
        case "invoiceDate":
        default:
          return compareValues(a.invoiceDate.getTime(), b.invoiceDate.getTime(), dir);
      }
    });
  }
  const headerProps = {
    currentSort: sortKey ?? "invoiceDate",
    currentDir: dir,
    basePath: "/invoices",
    queryParams: {
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
      clientId: searchParams.clientId,
      paymentStatus: searchParams.paymentStatus,
      aging: searchParams.aging,
    },
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Invoices</h1>
        <p className="text-sm text-muted">Payment status dihitung backend dari total invoice dan alokasi aktif — bukan diasumsikan frontend.</p>
        {searchParams.aging && (
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-warning-bg px-3 py-1 text-xs font-medium text-warning">
              Aging: {AGING_LABELS[searchParams.aging] ?? searchParams.aging}
            </span>
            <a href="/invoices" className="text-xs text-muted hover:text-primary">Hapus filter</a>
          </div>
        )}
      </div>

      <form action="/invoices" method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4">
        <FilterField label="Dari"><input type="date" name="dateFrom" defaultValue={searchParams.dateFrom} className="input" /></FilterField>
        <FilterField label="Sampai"><input type="date" name="dateTo" defaultValue={searchParams.dateTo} className="input" /></FilterField>
        <div className="w-48">
          <ClientTypeaheadField defaultClientId={searchParams.clientId} defaultClientName={selectedClient?.name} />
        </div>
        <FilterField label="Payment Status">
          <select name="paymentStatus" defaultValue={searchParams.paymentStatus ?? ""} className="input">
            <option value="">Semua</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="OVERPAID">Overpaid</option>
          </select>
        </FilterField>
        <button type="submit" className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">Filter</button>
        <a href="/invoices" className="rounded-control border border-border px-4 py-2 text-sm hover:bg-bg">Reset</a>
      </form>

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            hasFilters ? (
              <EmptyState title="Tidak ada hasil" description="Tidak ada invoice yang cocok dengan filter ini." />
            ) : (
              <EmptyState title="Belum ada invoice" description="Buat invoice pertama dari halaman Matter." />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <SortHeader label="Invoice Number" sortKey="invoiceNumber" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Matter" sortKey="matterName" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Client" sortKey="clientName" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Invoice Date" sortKey="invoiceDate" defaultDir="desc" {...headerProps} />
                    <SortHeader label="Due Date" sortKey="dueDate" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Total" sortKey="totalAmount" defaultDir="desc" align="right" {...headerProps} />
                    <SortHeader label="Allocated" sortKey="allocated" defaultDir="desc" align="right" {...headerProps} />
                    <SortHeader label="Outstanding" sortKey="outstanding" defaultDir="desc" align="right" {...headerProps} />
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => (
                    <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3"><a href={`/invoices/${inv.id}`} className="font-medium text-text hover:text-primary">{inv.invoiceNumber}</a></td>
                      <td className="px-5 py-3"><a href={`/matters/${inv.matterId}`} className="text-muted hover:text-primary">{inv.matter.matterName}</a></td>
                      <td className="px-5 py-3 text-muted"><a href={`/clients/${inv.matter.client.id}`} className="hover:text-primary">{inv.matter.client.name}</a></td>
                      <td className="px-5 py-3">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-5 py-3 text-muted">{inv.dueDate ? formatDate(inv.dueDate) : "-"}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(inv.totalAmount)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(inv.allocated)}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(inv.outstanding)}</td>
                      <td className="px-5 py-3"><PaymentStatusBadge status={inv.paymentStatus} /></td>
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
