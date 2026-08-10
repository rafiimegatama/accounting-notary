import { getClientListWithAggregates } from "@/lib/listAggregates";
import { getMatterFinancialOverview } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { Card, CardBody } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenericStatusBadge } from "@/components/ui/StatusBadge";
import { CreateClientForm } from "@/components/CreateClientForm";

export default async function ClientsPage({ searchParams }: { searchParams: { tab?: string; search?: string } }) {
  const tab = searchParams.tab === "matters" ? "matters" : "clients";
  const search = searchParams.search ?? "";

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
          {tab === "clients" ? <ClientsTable search={search} /> : <MattersTable search={search} />}
        </CardBody>
      </Card>
    </div>
  );
}

async function ClientsTable({ search }: { search: string }) {
  const clients = await getClientListWithAggregates(search || undefined);
  if (clients.length === 0) {
    return <EmptyState title="Belum ada client" description="Tambahkan client pertama untuk mulai mencatat aktivitas finansial." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted">
            <th className="px-5 py-3">Client</th>
            <th className="px-5 py-3">Type</th>
            <th className="px-5 py-3 text-right">Active Matters</th>
            <th className="px-5 py-3 text-right">Total Financial Activity</th>
            <th className="px-5 py-3 text-right">Outstanding</th>
            <th className="px-5 py-3 text-right">Deposit</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
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

async function MattersTable({ search }: { search: string }) {
  const matters = search
    ? await prisma.matter
        .findMany({ where: { matterName: { contains: search, mode: "insensitive" } }, select: { id: true } })
        .then((rows) => getMatterFinancialOverview(200).then((all) => all.filter((m) => rows.some((r) => r.id === m.id))))
    : await getMatterFinancialOverview(200);

  if (matters.length === 0) {
    return <EmptyState title="Belum ada matter" description="Tambahkan matter dari halaman client." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted">
            <th className="px-5 py-3">Matter</th>
            <th className="px-5 py-3">Client</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3 text-right">Total Cost</th>
            <th className="px-5 py-3 text-right">Invoice</th>
            <th className="px-5 py-3 text-right">Paid</th>
            <th className="px-5 py-3 text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {matters.map((m) => (
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
