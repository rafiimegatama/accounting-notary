import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { compareValues, type SortDir } from "@/lib/listSort";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenericStatusBadge } from "@/components/ui/StatusBadge";
import { SortHeader } from "@/components/ui/SortHeader";
import { ClientTypeaheadField } from "@/components/ui/ClientTypeaheadField";

interface Filters {
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  category?: string;
  sort?: string;
  dir?: string;
}

const COST_SORT_KEYS = ["costDate", "matterName", "clientName", "category", "amount"] as const;
type CostSortKey = (typeof COST_SORT_KEYS)[number];

export default async function CostDetailsPage({ searchParams }: { searchParams: Filters }) {
  const where: Record<string, unknown> = { status: "ACTIVE" };
  if (searchParams.clientId) where.matter = { clientId: searchParams.clientId };
  if (searchParams.category) where.category = searchParams.category;
  if (searchParams.dateFrom || searchParams.dateTo) {
    where.costDate = {
      gte: searchParams.dateFrom ? new Date(searchParams.dateFrom) : undefined,
      lte: searchParams.dateTo ? new Date(searchParams.dateTo) : undefined,
    };
  }

  const [costDetails, categoryRows, selectedClient] = await Promise.all([
    prisma.costDetail.findMany({
      where,
      orderBy: { costDate: "desc" },
      take: 150,
      include: { matter: { select: { id: true, matterName: true, client: { select: { id: true, name: true } } } }, invoice: { select: { id: true, invoiceNumber: true } } },
    }),
    prisma.costDetail.findMany({ where: { status: "ACTIVE", category: { not: null } }, select: { category: true }, distinct: ["category"] }),
    searchParams.clientId ? prisma.client.findUnique({ where: { id: searchParams.clientId }, select: { name: true } }) : null,
  ]);
  const categories = categoryRows.map((c) => c.category!).sort();
  const hasFilters = Boolean(searchParams.dateFrom || searchParams.dateTo || searchParams.clientId || searchParams.category);

  // Sort is opt-in: no sort param leaves the existing costDate-desc (from
  // the Prisma query above) untouched, so default behavior doesn't change.
  const dir: SortDir = searchParams.dir === "asc" ? "asc" : "desc";
  const sortKey = searchParams.sort && (COST_SORT_KEYS as readonly string[]).includes(searchParams.sort) ? (searchParams.sort as CostSortKey) : null;
  if (sortKey) {
    costDetails.sort((a, b) => {
      switch (sortKey) {
        case "matterName":
          return compareValues(a.matter.matterName, b.matter.matterName, dir);
        case "clientName":
          return compareValues(a.matter.client.name, b.matter.client.name, dir);
        case "category":
          return compareValues(a.category ?? "", b.category ?? "", dir);
        case "amount":
          return compareValues(Number(a.amount), Number(b.amount), dir);
        case "costDate":
        default:
          return compareValues(a.costDate.getTime(), b.costDate.getTime(), dir);
      }
    });
  }
  const headerProps = {
    currentSort: sortKey ?? "costDate",
    currentDir: dir,
    basePath: "/cost-details",
    queryParams: { dateFrom: searchParams.dateFrom, dateTo: searchParams.dateTo, clientId: searchParams.clientId, category: searchParams.category },
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Rincian Biaya</h1>
        <p className="text-sm text-muted">
          Menampilkan {costDetails.length} rincian biaya {hasFilters ? "sesuai filter" : "terbaru"} lintas semua matter.
        </p>
      </div>

      <form action="/cost-details" method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4">
        <FilterField label="Dari"><input type="date" name="dateFrom" defaultValue={searchParams.dateFrom} className="input" /></FilterField>
        <FilterField label="Sampai"><input type="date" name="dateTo" defaultValue={searchParams.dateTo} className="input" /></FilterField>
        <div className="w-48">
          <ClientTypeaheadField defaultClientId={searchParams.clientId} defaultClientName={selectedClient?.name} />
        </div>
        <FilterField label="Category">
          <select name="category" defaultValue={searchParams.category ?? ""} className="input">
            <option value="">Semua</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FilterField>
        <button type="submit" className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">Filter</button>
        <a href="/cost-details" className="rounded-control border border-border px-4 py-2 text-sm hover:bg-bg">Reset</a>
      </form>

      <Card>
        <CardBody className="p-0">
          {costDetails.length === 0 ? (
            hasFilters ? (
              <EmptyState title="Tidak ada hasil" description="Tidak ada rincian biaya yang cocok dengan filter ini." />
            ) : (
              <EmptyState title="Belum ada rincian biaya" description="Tambahkan cost detail dari halaman Matter." />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <SortHeader label="Date" sortKey="costDate" defaultDir="desc" {...headerProps} />
                    <SortHeader label="Matter" sortKey="matterName" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Client" sortKey="clientName" defaultDir="asc" {...headerProps} />
                    <th className="px-5 py-3">Description</th>
                    <SortHeader label="Category" sortKey="category" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Amount" sortKey="amount" defaultDir="desc" align="right" {...headerProps} />
                    <th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {costDetails.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3 whitespace-nowrap">{formatDate(c.costDate)}</td>
                      <td className="px-5 py-3"><a href={`/matters/${c.matter.id}`} className="font-medium text-text hover:text-primary">{c.matter.matterName}</a></td>
                      <td className="px-5 py-3 text-muted"><a href={`/clients/${c.matter.client.id}`} className="text-primary hover:underline">{c.matter.client.name}</a></td>
                      <td className="px-5 py-3">{c.description}</td>
                      <td className="px-5 py-3 text-muted">{c.category ?? "-"}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(c.amount)}</td>
                      <td className="px-5 py-3 text-muted">
                        {c.invoice ? <a href={`/invoices/${c.invoice.id}`} className="text-primary hover:underline">{c.invoice.invoiceNumber}</a> : "-"}
                      </td>
                      <td className="px-5 py-3"><GenericStatusBadge status={c.status} /></td>
                      <td className="px-5 py-3 text-muted">{c.sourceType}</td>
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
