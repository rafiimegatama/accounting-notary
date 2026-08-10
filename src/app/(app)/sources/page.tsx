import { getSourcesList } from "@/lib/sources";
import { formatDate } from "@/lib/formatCurrency";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

// Section 20 — reference system, NOT an Excel parser / WhatsApp API / bank
// scraper / Word parser. Purely centralizes source_type + source_reference
// + attachment count so staff can see where information came from.
export default async function SourcesPage() {
  const sources = await getSourcesList(150);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Sources &amp; Documents</h1>
        <p className="text-sm text-muted">Referensi sumber informasi — bukan integrasi otomatis ke Excel/WhatsApp/bank statement.</p>
      </div>

      <Card>
        <CardBody className="p-0">
          {sources.length === 0 ? (
            <EmptyState title="Belum ada sumber informasi" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Source Type</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Related Client</th>
                    <th className="px-5 py-3">Related Matter</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Attachment</th><th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={`${s.entityType}-${s.id}`} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3 font-medium text-text">{s.sourceType}</td>
                      <td className="px-5 py-3 text-muted">{s.sourceReference ?? "-"}</td>
                      <td className="px-5 py-3">{s.client ? <a href={`/clients/${s.client.id}`} className="hover:text-primary">{s.client.name}</a> : "-"}</td>
                      <td className="px-5 py-3">{s.matter ? <a href={`/matters/${s.matter.id}`} className="hover:text-primary">{s.matter.matterName}</a> : "-"}</td>
                      <td className="px-5 py-3 text-muted">{formatDate(s.createdAt)}</td>
                      <td className="px-5 py-3 text-muted">{s.attachmentCount > 0 ? `${s.attachmentCount} file` : "-"}</td>
                      <td className="px-5 py-3">
                        {s.entityType === "FINANCIAL_TRANSACTION" && <a href={`/transactions/${s.id}`} className="text-primary hover:underline">Trace →</a>}
                        {s.entityType === "COST_DETAIL" && <a href={`/matters/${s.matter.id}`} className="text-primary hover:underline">Lihat →</a>}
                      </td>
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
