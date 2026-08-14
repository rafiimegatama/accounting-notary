import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { compareValues, type SortDir } from "@/lib/listSort";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortHeader } from "@/components/ui/SortHeader";
import { ClientTypeaheadField } from "@/components/ui/ClientTypeaheadField";

const ZERO = new Prisma.Decimal(0);

interface Filters {
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  allocationStatus?: string;
  sort?: string;
  dir?: string;
}

const PAYMENT_SORT_KEYS = ["date", "clientName", "matterName", "amount", "allocated", "unallocated"] as const;
type PaymentSortKey = (typeof PAYMENT_SORT_KEYS)[number];

export default async function PaymentsPage({ searchParams }: { searchParams: Filters }) {
  const where: Record<string, unknown> = {};
  const transactionWhere: Record<string, unknown> = {};
  if (searchParams.clientId) transactionWhere.clientId = searchParams.clientId;
  if (searchParams.dateFrom || searchParams.dateTo) {
    transactionWhere.transactionDate = {
      gte: searchParams.dateFrom ? new Date(searchParams.dateFrom) : undefined,
      lte: searchParams.dateTo ? new Date(searchParams.dateTo) : undefined,
    };
  }
  if (Object.keys(transactionWhere).length > 0) where.transaction = transactionWhere;

  const [allPayments, selectedClient] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 150,
      include: {
        transaction: { include: { client: true, matter: true } },
        allocations: { where: { status: "ACTIVE" }, include: { invoice: { select: { id: true, invoiceNumber: true } } } },
      },
    }),
    searchParams.clientId ? prisma.client.findUnique({ where: { id: searchParams.clientId }, select: { name: true } }) : null,
  ]);

  const withAllocation = allPayments.map((p) => {
    const allocated = p.allocations.reduce((a, x) => a.add(x.amount), ZERO);
    return { ...p, allocated, unallocated: p.transaction.amount.sub(allocated) };
  });
  const onlyUnallocated = searchParams.allocationStatus === "UNALLOCATED";
  const payments = onlyUnallocated ? withAllocation.filter((p) => p.unallocated.gt(0)) : withAllocation;
  const hasFilters = Boolean(searchParams.dateFrom || searchParams.dateTo || searchParams.clientId || searchParams.allocationStatus);

  // Sort is opt-in: no sort param leaves the existing createdAt-desc (from
  // the Prisma query above) untouched.
  const dir: SortDir = searchParams.dir === "asc" ? "asc" : "desc";
  const sortKey = searchParams.sort && (PAYMENT_SORT_KEYS as readonly string[]).includes(searchParams.sort) ? (searchParams.sort as PaymentSortKey) : null;
  if (sortKey) {
    payments.sort((a, b) => {
      switch (sortKey) {
        case "clientName":
          return compareValues(a.transaction.client?.name ?? "", b.transaction.client?.name ?? "", dir);
        case "matterName":
          return compareValues(a.transaction.matter?.matterName ?? "", b.transaction.matter?.matterName ?? "", dir);
        case "amount":
          return compareValues(Number(a.transaction.amount), Number(b.transaction.amount), dir);
        case "allocated":
          return compareValues(Number(a.allocated), Number(b.allocated), dir);
        case "unallocated":
          return compareValues(Number(a.unallocated), Number(b.unallocated), dir);
        case "date":
        default:
          return compareValues(a.transaction.transactionDate.getTime(), b.transaction.transactionDate.getTime(), dir);
      }
    });
  }
  const headerProps = {
    currentSort: sortKey ?? "date",
    currentDir: dir,
    basePath: "/payments",
    queryParams: { dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo, clientId: searchParams.clientId, allocationStatus: searchParams.allocationStatus },
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Payments</h1>
        <p className="text-sm text-muted">Satu payment bisa dialokasikan ke lebih dari satu invoice.</p>
      </div>

      <form action="/payments" method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4">
        <FilterField label="Dari"><input type="date" name="dateFrom" defaultValue={searchParams.dateFrom} className="input" /></FilterField>
        <FilterField label="Sampai"><input type="date" name="dateTo" defaultValue={searchParams.dateTo} className="input" /></FilterField>
        <div className="w-48">
          <ClientTypeaheadField defaultClientId={searchParams.clientId} defaultClientName={selectedClient?.name} />
        </div>
        <FilterField label="Allocation Status">
          <select name="allocationStatus" defaultValue={searchParams.allocationStatus ?? ""} className="input">
            <option value="">Semua</option>
            <option value="UNALLOCATED">Belum teralokasi</option>
          </select>
        </FilterField>
        <button type="submit" className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">Filter</button>
        <a href="/payments" className="rounded-control border border-border px-4 py-2 text-sm hover:bg-bg">Reset</a>
      </form>

      <Card>
        <CardBody className="p-0">
          {payments.length === 0 ? (
            hasFilters ? (
              <EmptyState title="Tidak ada hasil" description="Tidak ada payment yang cocok dengan filter ini." />
            ) : (
              <EmptyState title="Belum ada payment" description="Klasifikasikan transaksi sebagai Payment dari halaman Transaction Detail." />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <SortHeader label="Date" sortKey="date" defaultDir="desc" {...headerProps} />
                    <SortHeader label="Client" sortKey="clientName" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Matter" sortKey="matterName" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Amount" sortKey="amount" defaultDir="desc" align="right" {...headerProps} />
                    <SortHeader label="Allocated" sortKey="allocated" defaultDir="desc" align="right" {...headerProps} />
                    <SortHeader label="Unallocated" sortKey="unallocated" defaultDir="desc" align="right" {...headerProps} />
                    <th className="px-5 py-3">Invoice(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3">{formatDate(p.transaction.transactionDate)}</td>
                      <td className="px-5 py-3">
                        {p.transaction.client ? <a href={`/clients/${p.transaction.client.id}`} className="text-primary hover:underline">{p.transaction.client.name}</a> : "-"}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {p.transaction.matter ? <a href={`/matters/${p.transaction.matter.id}`} className="text-primary hover:underline">{p.transaction.matter.matterName}</a> : "-"}
                      </td>
                      <td className="px-5 py-3 text-right"><a href={`/payments/${p.id}`} className="font-medium text-text hover:text-primary">{formatCurrency(p.transaction.amount)}</a></td>
                      <td className="px-5 py-3 text-right">{formatCurrency(p.allocated)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(p.unallocated)}</td>
                      <td className="px-5 py-3 text-muted">
                        {p.allocations.filter((a) => a.invoice).length === 0
                          ? "-"
                          : p.allocations
                              .filter((a) => a.invoice)
                              .map((a, i) => (
                                <span key={a.id}>
                                  {i > 0 && ", "}
                                  <a href={`/invoices/${a.invoice!.id}`} className="text-primary hover:underline">{a.invoice!.invoiceNumber}</a>
                                </span>
                              ))}
                      </td>
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
