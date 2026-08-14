import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/formatCurrency";
import { describeAge, formatBytes, type BackupStatus, type FreshnessStatus } from "@/lib/backupStatus";
import { ManualBackupInfoButton, RestoreInfoButton } from "@/components/BackupRecoveryActions";

// Settings > Backup & Recovery. Deliberately NOT a primary sidebar item —
// this is an operational safeguard/configuration concern, not a daily
// accounting workflow. Status shown here is read ONLY from what
// scripts/offsite-sync.sh's siblings (the `backup`/`attachments-backup`
// Compose services) already produced on disk (src/lib/backupStatus.ts, via
// the read-only mounts added in v37) — this component and its data source
// never write to, schedule, or trigger anything. The existing scripts and
// docs/DEPLOYMENT.md remain the sole source of truth for how backups
// actually run.

function timestampLabel(date: Date | null): string {
  if (!date) return "Belum ada backup tercatat";
  return `${formatDateTime(date)} (${describeAge(date)})`;
}

const FRESHNESS_COPY: Record<FreshnessStatus, { icon: string; tone: string }> = {
  HEALTHY: { icon: "✓", tone: "text-success" },
  WARNING: { icon: "⚠", tone: "text-warning" },
  NOT_CONFIGURED: { icon: "•", tone: "text-muted" },
};

function HealthRow({
  title,
  status,
  detail,
}: {
  title: string;
  status: FreshnessStatus;
  detail: string;
}) {
  const copy = FRESHNESS_COPY[status];
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className={`mt-0.5 text-sm font-semibold ${copy.tone}`} aria-hidden="true">{copy.icon}</span>
      <div>
        <div className="text-sm font-medium text-text">{title}</div>
        <div className="text-xs text-muted">{detail}</div>
      </div>
    </div>
  );
}

export function BackupRecoverySettings({ status }: { status: BackupStatus }) {
  const dbLabel = timestampLabel(status.database.lastBackupAt);
  const attachmentsLabel = timestampLabel(status.attachments.lastBackupAt);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-text">Backup &amp; Recovery</h2>
        <p className="mt-0.5 text-xs text-muted">
          Status backup aplikasi ini — untuk pengaturan teknis (jadwal, lokasi penyimpanan), lihat panduan
          deployment bersama administrator sistem.
        </p>
      </CardHeader>

      <CardBody className="space-y-6">
        {/* Backup Health */}
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Backup Health</h3>
          <div className="divide-y divide-border">
            <HealthRow title="Local backup" status={status.overall} detail={`Database: ${dbLabel}`} />
            <HealthRow
              title="Secondary backup"
              status="NOT_CONFIGURED"
              detail="Tidak terlihat dari aplikasi ini — dikelola dan diperiksa di level server oleh administrator sistem."
            />
            <HealthRow
              title="Restore verification"
              status="WARNING"
              detail="Belum pernah diverifikasi lewat proses restore nyata."
            />
          </div>
        </div>

        {/* Local Backup */}
        <div className="rounded-control border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text">Local Backup</h3>
              <p className="mt-0.5 text-xs text-muted">Terjadwal otomatis: Harian &middot; dikelola administrator sistem</p>
            </div>
            <ManualBackupInfoButton lastBackupLabel={dbLabel} />
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Backup database terakhir</dt>
              <dd className="text-text">{dbLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Backup dokumen terakhir</dt>
              <dd className="text-text">{attachmentsLabel}</dd>
            </div>
          </dl>
        </div>

        {/* Secondary Backup */}
        <div className="rounded-control border border-border p-4">
          <h3 className="text-sm font-semibold text-text">Secondary / Off-site Backup</h3>
          <p className="mt-1 text-sm text-muted">
            Backup sekunder disalin ke penyimpanan terpisah di server sebagai perlindungan tambahan jika disk utama
            bermasalah. Status dan riwayatnya dikelola serta diperiksa langsung di server oleh administrator sistem,
            dan saat ini tidak dapat ditampilkan dari dalam aplikasi.
          </p>
        </div>

        {/* Restore */}
        <div className="rounded-control border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text">Restore</h3>
              <p className="mt-0.5 text-xs text-muted">Tindakan berisiko tinggi &mdash; lihat prosedur sebelum melanjutkan.</p>
            </div>
            <RestoreInfoButton />
          </div>
        </div>

        {/* Backup History */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Backup History</h3>
          {status.history.length === 0 ? (
            <p className="text-sm text-muted">Belum ada riwayat backup yang terlihat dari aplikasi ini.</p>
          ) : (
            <ul className="divide-y divide-border">
              {status.history.map((entry) => (
                <li key={`${entry.label}-${entry.fileName}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <div className="text-text">{entry.label}</div>
                    <div className="text-xs text-muted">{timestampLabel(entry.timestamp)}</div>
                  </div>
                  <div className="text-xs text-muted">{formatBytes(entry.sizeBytes)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
