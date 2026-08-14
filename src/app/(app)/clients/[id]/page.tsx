import { cookies } from "next/headers";
import { getClientFinancialPosition } from "@/lib/position";
import { getClientHistory } from "@/lib/history";
import { getClientSourceSummary } from "@/lib/sources";
import { getBrandingSettings } from "@/lib/brandingServer";
import { FinancialPositionView } from "@/components/FinancialPositionView";
import { CreateMatterForm } from "@/components/CreateMatterForm";
import { UploadDocumentModal } from "@/components/UploadDocumentModal";
import { LITE_MODE_COOKIE, LITE_MODE_ON } from "@/lib/liteMode";

export default async function ClientPositionPage({ params }: { params: { id: string } }) {
  const liteMode = cookies().get(LITE_MODE_COOKIE)?.value === LITE_MODE_ON;
  const [position, history, sources, branding] = await Promise.all([
    getClientFinancialPosition(params.id),
    getClientHistory(params.id),
    // P2.4: count + recent list aggregated across the client's own direct
    // attachments plus every matter/cost-detail/invoice/transaction under
    // it — not just documents attached directly to the client record.
    getClientSourceSummary(params.id),
    // v25 print header — live setting, not the compile-time default, so a
    // customized eyebrow text actually shows up on the printed report too.
    getBrandingSettings(),
  ]);
  const attachments = sources.recent.map((s) => ({
    id: s.attachmentId,
    fileName: s.fileName,
    fileType: s.fileType,
    uploadedAt: s.uploadedAt,
    originLabel: s.originLabel,
    originHref: s.originHref,
  }));

  // Client-scope payments/deposits/disbursements shown here are only the
  // "linked to client but not yet to a matter" bucket (Step 6 intermediate
  // state) — per-matter detail lives on each matter's own page, reachable
  // via the Per-Matter Breakdown table.
  return (
    <FinancialPositionView
      scope="CLIENT"
      liteMode={liteMode}
      brandingEyebrow={branding.branding_hero_eyebrow}
      title={position.client.name}
      status={position.client.status}
      summary={position.summary}
      payments={position.unassignedToMatter.payments}
      deposits={position.unassignedToMatter.deposits}
      disbursements={position.unassignedToMatter.disbursements}
      attachments={attachments}
      attachmentsTotalCount={sources.count}
      history={history}
      matterBreakdown={position.matterBreakdown}
      linkHref={(kind, id) => (kind === "matter" ? `/matters/${id}` : `/transactions/${id}`)}
      actions={
        <>
          <a href="#matter-breakdown" className="inline-flex items-center rounded-control border border-border px-3 py-1.5 text-xs font-medium hover:bg-bg">
            View Matters
          </a>
          <UploadDocumentModal clientId={position.client.id} />
          <CreateMatterForm clientId={position.client.id} />
        </>
      }
    />
  );
}
