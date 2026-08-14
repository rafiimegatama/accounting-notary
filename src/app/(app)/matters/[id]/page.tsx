import { cookies } from "next/headers";
import { getMatterFinancialPosition } from "@/lib/position";
import { getMatterHistory } from "@/lib/history";
import { getMatterSourceSummary } from "@/lib/sources";
import { getBrandingSettings } from "@/lib/brandingServer";
import { FinancialPositionView } from "@/components/FinancialPositionView";
import { AddCostDetailModal } from "@/components/AddCostDetailModal";
import { CreateInvoiceModal } from "@/components/CreateInvoiceModal";
import { UploadDocumentModal } from "@/components/UploadDocumentModal";
import { LITE_MODE_COOKIE, LITE_MODE_ON } from "@/lib/liteMode";

// Server component: fetches directly via the lib functions (same code the
// API routes call) rather than making an internal HTTP round-trip to its
// own API — this page and /api/matters/[id]/position share logic, not just a contract.
export default async function MatterPositionPage({ params }: { params: { id: string } }) {
  const liteMode = cookies().get(LITE_MODE_COOKIE)?.value === LITE_MODE_ON;
  const [position, history, sources, branding] = await Promise.all([
    getMatterFinancialPosition(params.id),
    getMatterHistory(params.id),
    // P2.3: aggregated across Matter + Cost Detail + Invoice + Transaction —
    // not just attachments linked directly to the matter (see sources.ts).
    getMatterSourceSummary(params.id),
    // v25 print header — live setting, not the compile-time default.
    getBrandingSettings(),
  ]);
  const attachments = sources.map((s) => ({
    id: s.attachmentId,
    fileName: s.fileName,
    fileType: s.fileType,
    uploadedAt: s.uploadedAt,
    originLabel: s.originLabel,
    originHref: s.originHref,
  }));

  return (
    <FinancialPositionView
      scope="MATTER"
      liteMode={liteMode}
      brandingEyebrow={branding.branding_hero_eyebrow}
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
          <UploadDocumentModal matterId={params.id} />
        </>
      }
    />
  );
}
