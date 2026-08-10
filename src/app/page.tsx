import { prisma } from "@/lib/prisma";
import { getUnlinkedTransactions, getReviewRequiredTransactions } from "@/lib/reviewQueue";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";

// Dashboard — Step 14 nav item #1. Deliberately minimal (Step 14 decision
// register: no evidence more than these two counts is needed) — an entry
// point into Unlinked/Review, not a BI dashboard (explicit non-goal).
export default async function DashboardPage() {
  const [unlinked, reviewRequired, recentTransactions] = await Promise.all([
    getUnlinkedTransactions(),
    getReviewRequiredTransactions(),
    prisma.financialTransaction.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { client: { select: { name: true } }, matter: { select: { matterName: true } } },
    }),
  ]);

  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <a href="/review" style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, minWidth: 160, color: "inherit", textDecoration: "none" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Unlinked</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{unlinked.length}</div>
        </a>
        <a href="/review" style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, minWidth: 160, color: "inherit", textDecoration: "none" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Perlu Ditinjau</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{reviewRequired.length}</div>
        </a>
      </div>

      <h2>Transaksi Terbaru</h2>
      {recentTransactions.length === 0 ? (
        <p style={{ opacity: 0.6 }}>Belum ada transaksi.</p>
      ) : (
        <table width="100%" cellPadding={6}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Date</th><th>Amount</th><th>Description</th><th>Client / Matter</th>
            </tr>
          </thead>
          <tbody>
            {recentTransactions.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td>{formatDate(t.transactionDate)}</td>
                <td>{formatCurrency(t.amount)}</td>
                <td><a href={`/transactions/${t.id}`}>{t.description}</a></td>
                <td style={{ opacity: 0.7 }}>{t.client?.name ?? "Unlinked"}{t.matter ? ` / ${t.matter.matterName}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
