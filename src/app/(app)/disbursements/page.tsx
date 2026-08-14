import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { compareValues, type SortDir } from "@/lib/listSort";
import { getDisbursementSummaryByBankAccount, UNASSIGNED_BANK_ACCOUNT_KEY } from "@/lib/listAggregates";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortHeader } from "@/components/ui/SortHeader";

interface Filters {
  sort?: string;
  dir?: string;
  bankAccountId?: string;
}

const DISBURSEMENT_SORT_KEYS = ["date", "clientName", "matterName", "category", "amount"] as const;
type DisbursementSortKey = (typeof DISBURSEMENT_SORT_KEYS)[number];

export default async function DisbursementsPage({ searchParams }: { searchParams: Filters }) {
  const bankAccountFilter = searchParams.bankAccountId;
  const bankFilterWhere =
    bankAccountFilter === UNASSIGNED_BANK_ACCOUNT_KEY
      ? { bankAccountId: null }
      : bankAccountFilter
        ? { bankAccountId: bankAccountFilter }
        : undefined;

  const [disbursements, bankSummary] = await Promise.all([
    prisma.disbursement.findMany({
      where: bankFilterWhere,
      orderBy: { createdAt: "desc" },
      take: 150,
      // Roadmap #3 — join the funding bank/account (bankAccountId already
      // persisted on this row but was never displayed anywhere, see QA gap).
      include: { transaction: { include: { client: true, matter: true } }, bankAccount: true },
    }),
    // Painkiller #10 "Tracking payment pihak ketiga" — uncapped, so the
    // summary card above reflects ALL disbursements, not just this page's
    // most recent 150.
    getDisbursementSummaryByBankAccount(),
  ]);

  const activeBucket = bankAccountFilter ? bankSummary.find((s) => s.key === bankAccountFilter) : undefined;
  const activeFilterLabel = bankAccountFilter
    ? activeBucket?.bankAccount
      ? [activeBucket.bankAccount.bankName, activeBucket.bankAccount.accountName].filter(Boolean).join(" — ")
      : "Belum ada rekening tercatat"
    : null;

  // Sort is opt-in: no sort param leaves the existing createdAt-desc (from
  // the Prisma query above) untouched.
  const dir: SortDir = searchParams.dir === "asc" ? "asc" : "desc";
  const sortKey = searchParams.sort && (DISBURSEMENT_SORT_KEYS as readonly string[]).includes(searchParams.sort) ? (searchParams.sort as DisbursementSortKey) : null;
  if (sortKey) {
    disbursements.sort((a, b) => {
      switch (sortKey) {
        case "clientName":
          return compareValues(a.transaction.client?.name ?? "", b.transaction.client?.name ?? "", dir);
        case "matterName":
          return compareValues(a.transaction.matter?.matterName ?? "", b.transaction.matter?.matterName ?? "", dir);
        case "category":
          return compareValues(a.category ?? "", b.category ?? "", dir);
        case "amount":
          return compareValues(Number(a.transaction.amount), Number(b.transaction.amount), dir);
        case "date":
        default:
          return compareValues(a.transaction.transactionDate.getTime(), b.transaction.transactionDate.getTime(), dir);
      }
    });
  }
  const headerProps = { currentSort: sortKey ?? "date", currentDir: dir, basePath: "/disbursements", queryParams: { bankAccountId: bankAccountFilter } };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Disbursements</h1>
        <p className="text-sm text-muted">Pengeluaran atas nama client, mis. pembayaran BPHTB/PNBP dari uang titipan.</p>
      </div>

      {bankSummary.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text">Disbursement by Bank Account</h2>
            <p className="mt-0.5 text-xs text-muted">Total pengeluaran per rekening, seluruh matter.</p>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-2.5">Bank/Account</th>
                    <th className="px-5 py-2.5 text-right">Total</th>
                    <th className="px-5 py-2.5 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {bankSummary.map((s) => (
                    <tr key={s.key} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-2.5">
                        <a href={`/disbursements?bankAccountId=${s.key}`} className="text-primary hover:underline">
                          {s.bankAccount ? [s.bankAccount.bankName, s.bankAccount.accountName].filter(Boolean).join(" — ") : "Belum ada rekening tercatat"}
                        </a>
                      </td>
                      <td className="px-5 py-2.5 text-right">{formatCurrency(s.total)}</td>
                      <td className="px-5 py-2.5 text-right">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {bankAccountFilter && (
        <p className="text-sm text-muted">
          Difilter: {activeFilterLabel} — <a href="/disbursements" className="text-primary hover:underline">Tampilkan semua</a>
        </p>
      )}

      <Card>
        <CardBody className="p-0">
          {disbursements.length === 0 ? (
            <EmptyState title="Belum ada disbursement" description="Klasifikasikan transaksi (direction OUT) sebagai Disbursement dari halaman Transaction Detail." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <SortHeader label="Date" sortKey="date" defaultDir="desc" {...headerProps} />
                    <SortHeader label="Client" sortKey="clientName" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Matter" sortKey="matterName" defaultDir="asc" {...headerProps} />
                    <SortHeader label="Category" sortKey="category" defaultDir="asc" {...headerProps} />
                    {/* Not wired into DISBURSEMENT_SORT_KEYS/compareValues — kept
                        as a plain header, same convention as the Source column
                        below (supplementary metadata, not a primary sort key). */}
                    <th className="px-5 py-3">Bank Account</th>
                    <SortHeader label="Amount" sortKey="amount" defaultDir="desc" align="right" {...headerProps} />
                    <th className="px-5 py-3">Source</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {disbursements.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3">{formatDate(d.transaction.transactionDate)}</td>
                      <td className="px-5 py-3">
                        {d.transaction.client ? <a href={`/clients/${d.transaction.client.id}`} className="text-primary hover:underline">{d.transaction.client.name}</a> : "-"}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {d.transaction.matter ? <a href={`/matters/${d.transaction.matter.id}`} className="text-primary hover:underline">{d.transaction.matter.matterName}</a> : "-"}
                      </td>
                      <td className="px-5 py-3">{d.category ?? "-"}</td>
                      <td className="px-5 py-3 text-muted">
                        {d.bankAccount ? [d.bankAccount.bankName, d.bankAccount.accountName].filter(Boolean).join(" — ") : "-"}
                      </td>
                      <td className="px-5 py-3 text-right">{formatCurrency(d.transaction.amount)}</td>
                      <td className="px-5 py-3 text-muted">{d.transaction.sourceType}</td>
                      <td className="px-5 py-3"><a href={`/transactions/${d.financialTransactionId}`} className="text-primary hover:underline">Trace →</a></td>
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
