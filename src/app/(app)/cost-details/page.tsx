import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenericStatusBadge } from "@/components/ui/StatusBadge";

export default async function CostDetailsPage() {
  const costDetails = await prisma.costDetail.findMany({
    where: { status: "ACTIVE" },
    orderBy: { costDate: "desc" },
    take: 150,
    include: { matter: { select: { id: true, matterName: true, client: { select: { name: true } } } }, invoice: { select: { invoiceNumber: true } } },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Cost Details</h1>
        <p className="text-sm text-muted">Menampilkan 150 rincian biaya terbaru lintas semua matter.</p>
      </div>

      <Card>
        <CardBody className="p-0">
          {costDetails.length === 0 ? (
            <EmptyState title="Belum ada rincian biaya" description="Tambahkan cost detail dari halaman Matter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Date</th><th className="px-5 py-3">Matter</th><th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Description</th><th className="px-5 py-3">Category</th><th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {costDetails.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3 whitespace-nowrap">{formatDate(c.costDate)}</td>
                      <td className="px-5 py-3"><a href={`/matters/${c.matter.id}`} className="font-medium text-text hover:text-primary">{c.matter.matterName}</a></td>
                      <td className="px-5 py-3 text-muted">{c.matter.client.name}</td>
                      <td className="px-5 py-3">{c.description}</td>
                      <td className="px-5 py-3 text-muted">{c.category ?? "-"}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(c.amount)}</td>
                      <td className="px-5 py-3 text-muted">{c.invoice?.invoiceNumber ?? "-"}</td>
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
