import { requireSession } from "@/lib/requireSession";
import { formatCurrency, formatDateTime } from "@/lib/formatCurrency";
import { getDashboardSummaryCards, getFinancialTrend, getReviewDistribution, getMatterFinancialOverview, getRecentActivity } from "@/lib/dashboard";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { GenericStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FinancialTrendChart } from "@/components/charts/FinancialTrendChart";
import { ReviewDonutChart } from "@/components/charts/ReviewDonutChart";
import { describeTimelineEvent } from "@/lib/timelineLabel";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

export default async function DashboardPage({ searchParams }: { searchParams: { range?: string } }) {
  const session = requireSession();
  const range = [7, 30, 90].includes(Number(searchParams.range)) ? Number(searchParams.range) : 30;

  const [summary, trend, distribution, matterOverview, activity] = await Promise.all([
    getDashboardSummaryCards(),
    getFinancialTrend(range),
    getReviewDistribution(),
    getMatterFinancialOverview(10),
    getRecentActivity(10),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">{greeting()}, {session.staffName.split(" ")[0]}</h1>
        <p className="text-sm text-muted">Pantau posisi finansial client dan matter secara terpusat.</p>
      </div>

      <form action="/search" method="get">
        <input
          name="q"
          placeholder="Cari client, matter, transaksi, invoice..."
          className="w-full rounded-control border border-border bg-card px-4 py-3 text-sm shadow-sm focus:border-primary focus:outline-none"
        />
      </form>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Active Matters" value={String(summary.activeMatters)} href="/clients" />
        <SummaryCard label="Transactions Today" value={String(summary.transactionsToday)} href="/transactions" />
        <SummaryCard label="Unlinked Transactions" value={String(summary.unlinked)} href="/review" tone={summary.unlinked > 0 ? "warning" : "default"} />
        <SummaryCard label="Review Required" value={String(summary.reviewRequired)} href="/review" tone={summary.reviewRequired > 0 ? "danger" : "default"} />
        <SummaryCard label="Outstanding Invoices" value={formatCurrency(summary.outstandingTotal)} sub={`${summary.outstandingCount} invoice`} href="/invoices" />
        <SummaryCard label="Client Funds / Deposits" value={formatCurrency(summary.clientFundsRemaining)} href="/deposits" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Financial Activity Over Time</h2>
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <a
                  key={d}
                  href={`/?range=${d}`}
                  className={`rounded-control px-2.5 py-1 text-xs font-medium ${range === d ? "bg-primary text-white" : "text-muted hover:bg-bg"}`}
                >
                  {d} Hari
                </a>
              ))}
            </div>
          </CardHeader>
          <CardBody>
            <FinancialTrendChart data={trend} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text">Review Distribution</h2>
          </CardHeader>
          <CardBody>
            <ReviewDonutChart data={distribution} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">Matter Financial Overview</h2>
        </CardHeader>
        <CardBody className="p-0">
          {matterOverview.length === 0 ? (
            <EmptyState title="Belum ada matter" description="Tambahkan matter pertama untuk mulai mencatat aktivitas finansial." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Matter</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3 text-right">Total Cost</th>
                    <th className="px-5 py-3 text-right">Invoice</th>
                    <th className="px-5 py-3 text-right">Paid</th>
                    <th className="px-5 py-3 text-right">Outstanding</th>
                    <th className="px-5 py-3 text-right">Deposit</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matterOverview.map((m) => (
                    <tr key={m.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3"><a href={`/matters/${m.id}`} className="font-medium text-text hover:text-primary">{m.matterName}</a></td>
                      <td className="px-5 py-3 text-muted">{m.clientName}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(m.totalCost)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(m.totalInvoice)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(m.paid)}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(m.outstanding)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(m.depositRemaining)}</td>
                      <td className="px-5 py-3"><GenericStatusBadge status={m.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">Recent Activity</h2>
        </CardHeader>
        <CardBody>
          {activity.length === 0 ? (
            <EmptyState title="Belum ada aktivitas" />
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div>
                    <span className="text-text">{describeTimelineEvent(a)}</span>
                    <span className="ml-2 text-xs text-muted">{a.userId} · {formatDateTime(a.occurredAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
