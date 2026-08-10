import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/requireSession";
import { formatDateTime } from "@/lib/formatCurrency";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";

// Minimal settings surface — read-only for MVP. Changing exception-rule
// defaults (Step 9) is rare enough that direct DB access is acceptable for
// now; building a full settings CRUD + its own audit trail wasn't
// justified by any validated need (Section 41: avoid overengineering).
export default async function SettingsPage() {
  const session = requireSession();
  const [settings, staff] = await Promise.all([
    prisma.systemSetting.findMany({ orderBy: { key: "asc" } }),
    prisma.staff.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Settings</h1>
        <p className="text-sm text-muted">Anda login sebagai <strong>{session.staffName}</strong>.</p>
      </div>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Exception Rule Defaults</h2></CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs font-medium text-muted"><th className="px-5 py-2.5">Key</th><th className="px-5 py-2.5">Value</th><th className="px-5 py-2.5">Last Updated</th></tr></thead>
            <tbody>
              {settings.map((s) => (
                <tr key={s.key} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5 font-mono text-xs">{s.key}</td>
                  <td className="px-5 py-2.5">{s.value}</td>
                  <td className="px-5 py-2.5 text-muted">{formatDateTime(s.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Staf Aktif</h2></CardHeader>
        <CardBody>
          <ul className="space-y-1 text-sm">
            {staff.map((s) => <li key={s.id}>{s.name}</li>)}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
