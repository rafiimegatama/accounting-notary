import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/formatCurrency";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/enums";

interface Filters { entityType?: string; entityId?: string; userId?: string; action?: string }

// Section 22 — read-only, on purpose: this page (and /api/audit-log) only
// ever GETs. There is no route anywhere that can edit or delete an
// audit_log row from the UI — enforced doubly by the DB trigger
// trg_audit_log_no_delete (Step 11).
export default async function AuditLogPage({ searchParams }: { searchParams: Filters }) {
  const entries = await prisma.auditLog.findMany({
    where: {
      ...(searchParams.entityType ? { entityType: searchParams.entityType } : {}),
      ...(searchParams.entityId ? { entityId: searchParams.entityId } : {}),
      ...(searchParams.userId ? { userId: { contains: searchParams.userId, mode: "insensitive" } } : {}),
      ...(searchParams.action ? { action: searchParams.action } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Audit Log</h1>
        <p className="text-sm text-muted">Read-only. Setiap financial mutation tercatat di sini — tidak bisa diedit/dihapus dari UI manapun.</p>
      </div>

      <form action="/audit-log" method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4">
        <FilterField label="Entity Type">
          <select name="entityType" defaultValue={searchParams.entityType ?? ""} className="input">
            <option value="">Semua</option>
            {AUDIT_ENTITY_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </FilterField>
        <FilterField label="Entity ID"><input name="entityId" defaultValue={searchParams.entityId} placeholder="UUID..." className="input" /></FilterField>
        <FilterField label="User"><input name="userId" defaultValue={searchParams.userId} placeholder="Nama staf..." className="input" /></FilterField>
        <FilterField label="Action">
          <select name="action" defaultValue={searchParams.action ?? ""} className="input">
            <option value="">Semua</option>
            {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </FilterField>
        <button type="submit" className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">Filter</button>
        <a href="/audit-log" className="rounded-control border border-border px-4 py-2 text-sm hover:bg-bg">Reset</a>
      </form>

      <Card>
        <CardBody className="p-0">
          {entries.length === 0 ? (
            <EmptyState title="Tidak ada audit event" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Timestamp</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Entity</th>
                    <th className="px-5 py-3">Entity ID</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-bg">
                      <td className="px-5 py-3 whitespace-nowrap">{formatDateTime(e.occurredAt)}</td>
                      <td className="px-5 py-3">{e.userId}</td>
                      <td className="px-5 py-3 text-xs text-muted">{e.entityType}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted">{e.entityId.slice(0, 8)}</td>
                      <td className="px-5 py-3">{e.action}</td>
                      <td className="px-5 py-3 text-muted">{e.reason ?? "-"}</td>
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}
