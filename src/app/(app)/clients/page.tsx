import { getClientListWithAggregates } from "@/lib/listAggregates";
import { getMatterFinancialOverview } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { compareValues, type SortDir } from "@/lib/listSort";
import { Card, CardBody } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenericStatusBadge } from "@/components/ui/StatusBadge";
import { SortHeader } from "@/components/ui/SortHeader";
import { CreateClientForm } from "@/components/CreateClientForm";

interface PageSearchParams {
  tab?: string;
  search?: string;
  sort?: string;
  dir?: string;
}

export default async function ClientsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const tab = searchParams.tab === "matters" ? "matters" : "clients";
  const search = searchParams.search ?? "";
  const dir: SortDir = searchParams.dir === "asc" ? "asc" : "desc";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Clients & Matters</h1>
          <p className="text-sm text-muted">Kelola client dan matter kantor.</p>
        </div>
        <CreateClientForm />
      </div>

      <Tabs tabs={[{ key: "clients", label: "Clients" }, { key: "matters", label: "Matters" }]} active={tab} basePath="/clients" />

      <form action="/clients" method="get" className="flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input name="search" defaultValue={search} placeholder={tab === "clients" ? "Cari nama client..." : "Cari matter..."} className="input max-w-xs" />
        <button type="submit" className="rounded-control border border-border px-4 py-2 text-sm hover:bg-bg">Cari</button>
      </form>

      <Card>
        <CardBody className="p-0">
          {tab === "clients" ? (
            <ClientsTable search={search} sort={searchParams.sort ?? "outstanding"} dir={dir} />
          ) : (
            <MattersTable search={search} sort={searchParams.sort ?? "outstanding"} dir={dir} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

const CLIENT_SORT_KEYS = ["name", "activeMatters", "totalActivity", "outstanding", "depositRemaining", "lastActivity"] as const;
type ClientSortKey = (typeof CLIENT_SORT_KEYS)[number];

async function ClientsTable({ search, sort, dir }: { search: string; sort: string; dir: SortDir }) {
  const clients = await getClientListWithAggregates(search || undefined);
  if (clients.length === 0) {
    return <EmptyState title="Belum ada client" description="Tambahkan client pertama untuk mulai mencatat aktivitas finansial." />;
  }

  const sortKey: ClientSortKey = (CLIENT_SORT_KEYS as readonly string[]).includes(sort) ? (sort as ClientSortKey) : "outstanding";
  const sorted = [...clients].sort((a, b) => {
    switch (sortKey) {
      case "name":
        return compareValues(a.name, b.name, dir);
      case "activeMatters":
        return compareValues(a.activeMatters, b.activeMatters, dir);
      case "totalActivity":
        return compareValues(Number(a.totalActivity), Number(b.totalActivity), dir);
      case "depositRemaining":
        return compareValues(Number(a.depositRemaining), Number(b.depositRemaining), dir);
      case "lastActivity":
        return compareValues(a.lastActivity?.getTime() ?? 0, b.lastActivity?.getTime() ?? 0, dir);
      case "outstanding":
      default:
        return compareValues(Number(a.outstanding), Number(b.outstanding), dir);
    }
  });

  const headerProps = { currentSort: sortKey, currentDir: dir, basePath: "/clients", queryParams: { tab: "clients", search } };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted">
            <SortHeader label="Client" sortKey="name" defaultDir="asc" {...headerProps} />
            <th className="px-5 py-3">Type</th>
            <SortHeader label="Active Matters" sortKey="activeMatters" defaultDir="desc" align="right" {...headerProps} />
            <SortHeader label="Total Financial Activity" sortKey="totalActivity" defaultDir="desc" align="right" {...headerProps} />
            <SortHeader label="Outstanding" sortKey="outstanding" defaultDir="desc" align="right" {...headerProps} />
            <SortHeader label="Deposit" sortKey="depositRemaining" defaultDir="desc" align="right" {...headerProps} />
            <th className="px-5 py-3">Status</th>
            <SortHeader label="Last Activity" sortKey="lastActivity" defaultDir="desc" {...headerProps} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg">
              <td className="px-5 py-3"><a href={`/clients/${c.id}`} className="font-medium text-text hover:text-primary">{c.name}</a></td>
              <td className="px-5 py-3 text-muted">{c.clientType ?? "-"}</td>
              <td className="px-5 py-3 text-right">{c.activeMatters} / {c.totalMatters}</td>
              <td className="px-5 py-3 text-right">{formatCurrency(c.totalActivity)}</td>
              <td className="px-5 py-3 text-right">{formatCurrency(c.outstanding)}</td>
              <td className="px-5 py-3 text-right">{formatCurrency(c.depositRemaining)}</td>
              <td className="px-5 py-3"><GenericStatusBadge status={c.status} /></td>
              <td className="px-5 py-3 text-muted">{c.lastActivity ? formatDate(c.lastActivity) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MATTER_SORT_KEYS = ["matterName", "clientName", "totalCost", "totalInvoice", "paid", "outstanding"] as const;
type MatterSortKey = (typeof MATTER_SORT_KEYS)[number];

async function MattersTable({ search, sort, dir }: { search: string; sort: string; dir: SortDir }) {
  const matters = search
    ? await prisma.matter
        .findMany({ where: { matterName: { contains: search, mode: "insensitive" } }, select: { id: true } })
        .then((rows) => getMatterFinancialOverview(200).then((all) => all.filter((m) => rows.some((r) => r.id === m.id))))
    : await getMatterFinancialOverview(200);

  if (matters.length === 0) {
    return <EmptyState title="Belum ada matter" description="Tambahkan matter dari halaman client." />;
  }

  const sortKey: MatterSortKey = (MATTER_SORT_KEYS as readonly string[]).includes(sort) ? (sort as MatterSortKey) : "outstanding";
  const sorted = [...matters].sort((a, b) => {
    switch (sortKey) {
      case "matterName":
        return compareValues(a.matterName, b.matterName, dir);
      case "clientName":
        return compareValues(a.clientName, b.clientName, dir);
      case "totalCost":
        return compareValues(Number(a.totalCost), Number(b.totalCost), dir);
      case "totalInvoice":
        return compareValues(Number(a.totalInvoice), Number(b.totalInvoice), dir);
      case "paid":
        return compareValues(Number(a.paid), Number(b.paid), dir);
      case "outstanding":
      default:
        return compareValues(Number(a.outstanding), Number(b.outstanding), dir);
    }
  });

  const headerProps = { currentSort: sortKey, currentDir: dir, basePath: "/clients", queryParams: { tab: "matters", search } };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted">
            <SortHeader label="Matter" sortKey="matterName" defaultDir="asc" {...headerProps} />
            <SortHeader label="Client" sortKey="clientName" defaultDir="asc" {...headerProps} />
            <th className="px-5 py-3">Status</th>
            <SortHeader label="Rincian Biaya" sortKey="totalCost" defaultDir="desc" align="right" {...headerProps} />
            <SortHeader label="Invoice" sortKey="totalInvoice" defaultDir="desc" align="right" {...headerProps} />
            <SortHeader label="Paid" sortKey="paid" defaultDir="desc" align="right" {...headerProps} />
            <SortHeader label="Outstanding" sortKey="outstanding" defaultDir="desc" align="right" {...headerProps} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.id} className="border-b border-border last:border-0 hover:bg-bg">
              <td className="px-5 py-3"><a href={`/matters/${m.id}`} className="font-medium text-text hover:text-primary">{m.matterName}</a></td>
              <td className="px-5 py-3 text-muted">{m.clientName}</td>
              <td className="px-5 py-3"><GenericStatusBadge status={m.status} /></td>
              <td className="px-5 py-3 text-right">{formatCurrency(m.totalCost)}</td>
              <td className="px-5 py-3 text-right">{formatCurrency(m.totalInvoice)}</td>
              <td className="px-5 py-3 text-right">{formatCurrency(m.paid)}</td>
              <td className="px-5 py-3 text-right font-medium">{formatCurrency(m.outstanding)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
