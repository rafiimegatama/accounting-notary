import { getClientFinancialPosition } from "@/lib/position";
import { getClientHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";
import { FinancialPositionView } from "@/components/FinancialPositionView";

export default async function ClientPositionPage({ params }: { params: { id: string } }) {
  const [position, history, attachments] = await Promise.all([
    getClientFinancialPosition(params.id),
    getClientHistory(params.id),
    prisma.financialAttachment.findMany({ where: { clientId: params.id }, orderBy: { uploadedAt: "desc" } }),
  ]);

  // Client-scope payments/deposits/disbursements shown here are only the
  // "linked to client but not yet to a matter" bucket (Step 6 intermediate
  // state) — per-matter detail lives on each matter's own page, reachable
  // via the Per-Matter Breakdown table.
  return (
    <FinancialPositionView
      scope="CLIENT"
      title={position.client.name}
      status={position.client.status}
      summary={position.summary}
      payments={position.unassignedToMatter.payments}
      deposits={position.unassignedToMatter.deposits}
      disbursements={position.unassignedToMatter.disbursements}
      attachments={attachments}
      history={history}
      matterBreakdown={position.matterBreakdown}
      linkHref={(kind, id) => (kind === "matter" ? `/matters/${id}` : `/transactions/${id}`)}
      actions={
        <a href="#matter-breakdown" className="inline-flex items-center rounded-control border border-border px-3 py-1.5 text-xs font-medium hover:bg-bg">
          View Matters
        </a>
      }
    />
  );
}
