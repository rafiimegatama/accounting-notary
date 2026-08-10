import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";

export default async function CostDetailsPage() {
  const costDetails = await prisma.costDetail.findMany({
    where: { status: "ACTIVE" },
    orderBy: { costDate: "desc" },
    take: 100,
    include: { matter: { select: { id: true, matterName: true, client: { select: { name: true } } } } },
  });

  return (
    <div>
      <h1>Cost Details</h1>
      <p style={{ opacity: 0.7, fontSize: 13 }}>Menampilkan 100 rincian biaya terbaru lintas semua matter.</p>
      <table width="100%" cellPadding={6}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Matter</th>
          </tr>
        </thead>
        <tbody>
          {costDetails.map((c) => (
            <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>{formatDate(c.costDate)}</td>
              <td>{c.description}</td>
              <td>{c.category ?? "-"}</td>
              <td>{formatCurrency(c.amount)}</td>
              <td><a href={`/matters/${c.matter.id}`}>{c.matter.client.name} / {c.matter.matterName}</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
