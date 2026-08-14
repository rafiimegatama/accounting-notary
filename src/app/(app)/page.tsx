import { cookies } from "next/headers";
import { requireSession } from "@/lib/requireSession";
import { formatCurrency, formatDateTime } from "@/lib/formatCurrency";
import { getDashboardSummaryCards, getFinancialTrend, getReviewDistribution, getOutstandingAging, getUnlinkedBacklogAging, getMatterFinancialOverview, getRecentActivity } from "@/lib/dashboard";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { SummaryCard } from "@/components/ui/SummaryCard";
import { GenericStatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FinancialTrendChart } from "@/components/charts/FinancialTrendChart";
import { ReviewDonutChart } from "@/components/charts/ReviewDonutChart";
import { AgingBarChart } from "@/components/charts/AgingBarChart";
import { UnlinkedAgingChart } from "@/components/charts/UnlinkedAgingChart";
import { DashboardClock } from "@/components/DashboardClock";
import { accentClassName, brandingImageUrl } from "@/lib/branding";
import { getBrandingSettings } from "@/lib/brandingServer";
import { describeTimelineEvent } from "@/lib/timelineLabel";
import { LITE_MODE_COOKIE, LITE_MODE_ON } from "@/lib/liteMode";

// P1.2 "Needs Attention": actionable, not just informational — reuses the
// same summary aggregation already computed for the cards above (no
// duplicate calculation), ordered by priority, each item clickable to the
// existing filtered view that answers it. No AI, no scoring model, no
// alert spam — items with a zero count simply don't render.
function NeedsAttention({ summary }: { summary: Awaited<ReturnType<typeof getDashboardSummaryCards>> }) {
  const items = [
    {
      key: "review",
      count: summary.reviewRequired,
      label: "Review Required",
      // Why-copy validated against exceptionRules.ts: advisory rule engine
      // flag, not a hard block — see FIELD_HELP.reviewStatus for the same
      // framing used elsewhere in the app.
      description: "Item yang memerlukan review berdasarkan aturan sistem.",
      href: "/review",
      tone: "danger" as const,
    },
    {
      key: "unlinked",
      count: summary.unlinked,
      label: "Unlinked Transactions",
      // "maupun" (not "atau"): dashboard.ts's `unlinked` query requires
      // clientId AND matterId both null, so wording must not imply a
      // partially-linked transaction (client set, matter missing) counts.
      description: "Transaction yang belum terhubung ke Client maupun Matter.",
      href: "/transactions?linked=unlinked",
      tone: "warning" as const,
    },
    {
      key: "unallocated",
      count: summary.unallocatedPaymentCount,
      label: "Unallocated Payments",
      description: "Payment yang belum sepenuhnya dialokasikan ke invoice.",
      href: "/payments?allocationStatus=UNALLOCATED",
      tone: "warning" as const,
    },
    {
      key: "source",
      count: summary.sourcePending,
      label: "Source Pending",
      description: "Transaction yang sumber atau referensinya belum dilengkapi.",
      href: "/transactions?sourceType=SOURCE_PENDING",
      tone: "warning" as const,
    },
    {
      key: "overdue",
      count: summary.overdueCount,
      label: "Overdue Invoices",
      description: "Invoice yang telah melewati tanggal jatuh tempo.",
      href: "/invoices?aging=overdue",
      tone: "danger" as const,
    },
    {
      key: "outstanding",
      count: summary.outstandingCount,
      label: "Outstanding Invoices",
      description: "Invoice yang masih memiliki saldo belum terbayar.",
      href: "/invoices?outstanding=1",
      tone: "default" as const,
    },
  ].filter((item) => item.count > 0);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text">Needs Attention</h2>
        <p className="mt-0.5 text-xs text-muted">Apa yang perlu dikerjakan sekarang.</p>
      </CardHeader>
      <CardBody className={items.length === 0 ? "" : "p-0"}>
        {items.length === 0 ? (
          <EmptyState title="Semua aman" description="Tidak ada item yang perlu ditindaklanjuti saat ini." />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.key} className="flex items-center gap-1 hover:bg-bg">
                {/* Two separate links, not nested (invalid HTML + competing
                    click targets): main row navigates to the filtered list
                    as before, the small "?" navigates to the matching
                    section of /guide — added after an accountant said she
                    didn't know WHY a category appeared until this existed
                    right where she's confused, not buried in a separate
                    page she has to remember to open. */}
                <a href={item.href} className="flex flex-1 items-center justify-between gap-4 px-5 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        item.tone === "danger" ? "bg-danger" : item.tone === "warning" ? "bg-warning" : "bg-primary"
                      }`}
                    />
                    <div>
                      <div className="font-medium text-text">{item.label}</div>
                      <div className="text-xs text-muted">{item.description}</div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.tone === "danger"
                        ? "bg-danger-bg text-danger"
                        : item.tone === "warning"
                        ? "bg-warning-bg text-warning"
                        : "bg-bg text-text"
                    }`}
                  >
                    {item.count}
                  </span>
                </a>
                <a
                  href={`/guide#${item.key}`}
                  title="Kenapa ini muncul?"
                  aria-label={`Kenapa ${item.label} muncul? Buka panduan`}
                  className="mr-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-muted hover:bg-card hover:text-primary"
                >
                  ?
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

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
  const liteMode = cookies().get(LITE_MODE_COOKIE)?.value === LITE_MODE_ON;

  const [summary, matterOverview, activity, branding] = await Promise.all([
    getDashboardSummaryCards(),
    getMatterFinancialOverview(10),
    getRecentActivity(10),
    getBrandingSettings(),
  ]);
  // Lite Mode: skip fetching chart data entirely, not just hiding it after
  // the fact — a real (small) server-side saving, not only a visual one.
  const [trend, distribution, aging, unlinkedAging] = liteMode
    ? [null, null, null, null]
    : await Promise.all([getFinancialTrend(range), getReviewDistribution(), getOutstandingAging(), getUnlinkedBacklogAging()]);

  return (
    <div className="flex flex-col gap-6">
      {/* Dashboard hero — visual/UX refinement only, no data or business
          logic here beyond what page.tsx already computed above (greeting,
          staff name, search form action/name are all unchanged). When no
          custom image is set, background is pure CSS (gradients + a faint
          grid). When one is set, it's covered by a mandatory accent-color
          overlay at 60% opacity so text stays readable regardless of what
          was uploaded — see BrandingImageField / the image upload route
          for the size/type guardrails on what can be uploaded at all. */}
      <div className={`relative overflow-hidden rounded-card px-6 py-6 sm:px-8 sm:py-7 ${accentClassName(branding.branding_accent)}`}>
        {branding.branding_hero_image && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${brandingImageUrl("hero")})` }}
            aria-hidden="true"
          />
        )}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {branding.branding_hero_image ? (
            <div className={`absolute inset-0 opacity-60 ${accentClassName(branding.branding_accent)}`} />
          ) : (
            <>
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
              <div className="absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
              <div
                className="absolute inset-0 opacity-[0.05]"
                style={{
                  backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />
            </>
          )}
        </div>

        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="mb-2 inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70">
                {branding.branding_hero_eyebrow}
              </span>
              <h1 className="text-2xl font-semibold text-white sm:text-3xl">{greeting()}, {session.staffName.split(" ")[0]}</h1>
              <p className="mt-1 text-sm text-white/70">{branding.branding_hero_subtitle}</p>
            </div>
            <DashboardClock />
          </div>

          {/* Operational Snapshot — navigation shortcuts, not a second set
              of KPI cards. Values are the exact same `summary` object the
              KPI row below already reads (getDashboardSummaryCards(),
              fetched once above) — no second calculation, so these numbers
              can never drift from the KPI cards. Routes are the same ones
              already established elsewhere on this page (Needs Attention,
              KPI cards): /clients?tab=matters, /transactions?linked=unlinked,
              /review. Global search (top nav) is untouched — this replaces
              only the redundant search box that used to live in the hero. */}
          <div className="flex flex-wrap items-center gap-x-1 gap-y-3 border-t border-white/10 pt-4">
            {[
              {
                key: "matters",
                href: "/clients?tab=matters",
                value: summary.activeMatters,
                label: "Active Matters",
                valueClassName: "text-white",
                ariaLabel: `${summary.activeMatters} Active Matters — buka daftar matter`,
              },
              {
                key: "unlinked",
                href: "/transactions?linked=unlinked",
                value: summary.unlinked,
                label: "Unlinked Transactions",
                valueClassName: "text-amber-300",
                ariaLabel: `${summary.unlinked} Unlinked Transactions — buka transaksi yang belum terhubung`,
              },
              {
                key: "review",
                href: "/review",
                value: summary.reviewRequired,
                label: "Review Required",
                valueClassName: "text-rose-300",
                ariaLabel: `${summary.reviewRequired} Review Required — buka daftar transaksi yang perlu ditinjau`,
              },
            ].map((item, i) => (
              <a
                key={item.key}
                href={item.href}
                aria-label={item.ariaLabel}
                className={`group flex items-center gap-2 rounded-control px-3 py-2 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 focus-visible:outline-offset-2 ${
                  i > 0 ? "sm:border-l sm:border-white/15" : ""
                }`}
              >
                <span className={`text-lg font-semibold leading-none ${item.valueClassName}`}>{item.value}</span>
                <span className="text-xs text-white/70">{item.label}</span>
                <svg
                  className="h-3 w-3 shrink-0 text-white/50 opacity-0 transition-opacity group-hover:opacity-100"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Transactions Today" value={String(summary.transactionsToday)} href="/transactions" />
        <SummaryCard label="Outstanding Invoices" value={formatCurrency(summary.outstandingTotal)} sub={`${summary.outstandingCount} invoice`} href="/invoices" />
        <SummaryCard label="Client Funds / Deposits" value={formatCurrency(summary.clientFundsRemaining)} href="/deposits" />
      </div>

      {liteMode ? (
        <NeedsAttention summary={summary} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <NeedsAttention summary={summary} />
          </div>
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">Unlinked Transactions by Age</h2>
              <p className="mt-0.5 text-xs text-muted">
                Backlog belum terhubung client/matter, dikelompokkan berdasarkan usia — bukan indikasi urgensi.
              </p>
            </CardHeader>
            <CardBody>{unlinkedAging && <UnlinkedAgingChart data={unlinkedAging} />}</CardBody>
          </Card>
        </div>
      )}

      {!liteMode && trend && distribution && aging && (
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

          <Card className="lg:col-span-3">
            <CardHeader>
              <h2 className="text-sm font-semibold text-text">Outstanding Invoice Aging</h2>
              <p className="mt-0.5 text-xs text-muted">Seberapa lama invoice outstanding sudah lewat jatuh tempo.</p>
            </CardHeader>
            <CardBody>
              <AgingBarChart data={aging} />
            </CardBody>
          </Card>
        </div>
      )}

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
                    <th className="px-5 py-3 text-right">Rincian Biaya</th>
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
