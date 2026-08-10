import { getMatterFinancialPosition } from "@/lib/position";
import { getMatterHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";
import { FinancialPositionView } from "@/components/FinancialPositionView";
import { AddCostDetailModal } from "@/components/AddCostDetailModal";
import { CreateInvoiceModal } from "@/components/CreateInvoiceModal";

// Server component: fetches directly via the lib functions (same code the
// API routes call) rather than making an internal HTTP round-trip to its
// own API — this page and /api/matters/[id]/position share logic, not just a contract.
export default async function MatterPositionPage({ params }: { params: { id: string } }) {
  const [position, history, attachments] = await Promise.all([
    getMatterFinancialPosition(params.id),
    getMatterHistory(params.id),
    prisma.financialAttachment.findMany({ where: { matterId: params.id }, orderBy: { uploadedAt: "desc" } }),
  ]);

  return (
    <FinancialPositionView
      scope="MATTER"
      title={position.matter.matterName}
      subtitle={position.matter.client.name}
      status={position.matter.status}
      summary={position.summary}
      costDetails={position.detail.costDetails}
      invoices={position.detail.invoices}
      payments={position.detail.payments}
      deposits={position.detail.deposits}
      disbursements={position.detail.disbursements}
      attachments={attachments}
      history={history}
      linkHref={(kind, id) => (kind === "matter" ? `/matters/${id}` : `/transactions/${id}`)}
      actions={
        <>
          <AddCostDetailModal matterId={params.id} />
          <CreateInvoiceModal matterId={params.id} />
        </>
      }
    />
  );
}
