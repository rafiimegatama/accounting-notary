import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/requireSession";
import { formatDateTime } from "@/lib/formatCurrency";
import { BRANDING_KEYS } from "@/lib/branding";
import { getBrandingSettings } from "@/lib/brandingServer";
import { getBackupStatus } from "@/lib/backupStatus";
import { BrandingSettingsForm } from "@/components/BrandingSettingsForm";
import { BackupRecoverySettings } from "@/components/BackupRecoverySettings";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";

// Exception-rule defaults stay read-only — changing them is rare enough
// that direct DB access remains acceptable (Section 41: avoid
// overengineering). Branding is the one deliberately bounded exception: a
// fixed set of text fields + a closed accent-color preset list, backed by
// the same SystemSetting table, added because staff wanted to tweak
// hero/login wording without a code round-trip every time — see
// BrandingSettingsForm / /api/settings/branding for the guardrails.
export default async function SettingsPage() {
  const session = requireSession();
  const [settings, staff, branding, backupStatus] = await Promise.all([
    prisma.systemSetting.findMany({ where: { key: { notIn: BRANDING_KEYS } }, orderBy: { key: "asc" } }),
    prisma.staff.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    getBrandingSettings(),
    getBackupStatus(),
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
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">Branding</h2>
          <p className="mt-0.5 text-xs text-muted">Ubah teks dan warna aksen Dashboard hero &amp; Login screen — tidak mengubah layout atau data finansial.</p>
        </CardHeader>
        <CardBody className="p-0">
          <BrandingSettingsForm initial={branding} />
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

      <BackupRecoverySettings status={backupStatus} />
    </div>
  );
}
