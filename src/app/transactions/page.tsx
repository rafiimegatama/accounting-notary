import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";

// Flat ledger view across all clients/matters — Step 14: for staff who
// think in terms of "what happened recently," not "this client's position."
export default async function TransactionsPage() {
  const transactions = await prisma.financialTransaction.findMany({
    where: { status: "ACTIVE" },
    orderBy: { transactionDate: "desc" },
    take: 100,
    include: { client: { select: { name: true } }, matter: { select: { matterName: true } } },
  });

  return (
    <div>
      <h1>Financial Transactions</h1>
      <p style={{ opacity: 0.7, fontSize: 13 }}>Menampilkan 100 transaksi terbaru. Gunakan Search untuk mencari transaksi spesifik.</p>
      <table width="100%" cellPadding={6}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Date</th><th>Amount</th><th>Direction</th><th>Description</th><th>Client / Matter</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>{formatDate(t.transactionDate)}</td>
              <td>{formatCurrency(t.amount)}</td>
              <td>{t.direction}</td>
              <td><a href={`/transactions/${t.id}`}>{t.description}</a></td>
              <td style={{ opacity: 0.7 }}>{t.client?.name ?? "Unlinked"}{t.matter ? ` / ${t.matter.matterName}` : ""}</td>
              <td>{t.reviewStatus !== "NORMAL" && <span style={{ background: t.reviewStatus === "REVIEW_REQUIRED" ? "#fca5a5" : "#fde68a", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{t.reviewStatus}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
