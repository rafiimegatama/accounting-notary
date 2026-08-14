import { readdir, stat } from "node:fs/promises";
import path from "node:path";

// Reads (never writes) the output of scripts/offsite-sync.sh's siblings —
// the `backup`/`attachments-backup` Compose services (docker-compose.yml) —
// via the read-only bind mounts added in v37. This module is NOT a backup
// engine and must never become one: it only reports what those existing,
// authoritative mechanisms already produced. Same env-var-with-local-dev-
// fallback shape as ATTACHMENTS_DIR (src/app/api/settings/branding/image/
// route.ts) so it also works outside Docker.
const BACKUP_DB_DIR = process.env.BACKUP_DB_DIR ?? path.join(process.cwd(), "backups", "db");
const BACKUP_ATTACHMENTS_DIR = process.env.BACKUP_ATTACHMENTS_DIR ?? path.join(process.cwd(), "backups", "attachments");

// Reuses the exact 48h threshold scripts/check-health.sh already applies to
// the offsite mirror (v36) rather than inventing a second number for a
// different directory — both are fed by the same @daily schedule.
const STALE_THRESHOLD_HOURS = 48;

export type FreshnessStatus = "HEALTHY" | "WARNING" | "NOT_CONFIGURED";

export function classifyFreshness(lastBackupAt: Date | null, now: Date = new Date()): FreshnessStatus {
  if (!lastBackupAt) return "NOT_CONFIGURED";
  const ageHours = (now.getTime() - lastBackupAt.getTime()) / (1000 * 60 * 60);
  return ageHours <= STALE_THRESHOLD_HOURS ? "HEALTHY" : "WARNING";
}

// NOT_CONFIGURED dominates (nothing to report beats a warning about it),
// otherwise the worse of the two states wins.
export function worstFreshness(a: FreshnessStatus, b: FreshnessStatus): FreshnessStatus {
  if (a === "NOT_CONFIGURED" || b === "NOT_CONFIGURED") return "NOT_CONFIGURED";
  if (a === "WARNING" || b === "WARNING") return "WARNING";
  return "HEALTHY";
}

export function describeAge(date: Date, now: Date = new Date()): string {
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  return `${diffDays} hari lalu`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

interface FileInfo {
  name: string;
  mtime: Date;
  sizeBytes: number;
}

// Recursive because the `backup` service's own image (prodrigestivill/
// postgres-backup-local) organizes dumps into daily/weekly/monthly/last
// subfolders — this only ever reads, never assumes or changes that layout.
async function listFilesRecursive(dir: string): Promise<FileInfo[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // not mounted / doesn't exist yet — honest "no data", not an error
  }
  const results: FileInfo[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(fullPath)));
    } else if (entry.isFile()) {
      try {
        const s = await stat(fullPath);
        results.push({ name: entry.name, mtime: s.mtime, sizeBytes: s.size });
      } catch {
        // permission/race edge case on a single file — skip it, don't fail the whole status
      }
    }
  }
  return results;
}

function latestOf(files: FileInfo[]): Date | null {
  if (files.length === 0) return null;
  return files.reduce((max, f) => (f.mtime > max ? f.mtime : max), files[0].mtime);
}

export interface BackupHistoryEntry {
  label: string;
  fileName: string;
  timestamp: Date;
  sizeBytes: number;
}

export interface BackupStatus {
  database: { status: FreshnessStatus; lastBackupAt: Date | null };
  attachments: { status: FreshnessStatus; lastBackupAt: Date | null };
  overall: FreshnessStatus;
  history: BackupHistoryEntry[];
}

const HISTORY_LIMIT = 8;

export async function getBackupStatus({
  dbDir = BACKUP_DB_DIR,
  attachmentsDir = BACKUP_ATTACHMENTS_DIR,
  now = new Date(),
}: { dbDir?: string; attachmentsDir?: string; now?: Date } = {}): Promise<BackupStatus> {
  const [dbFiles, attachmentFiles] = await Promise.all([
    listFilesRecursive(dbDir),
    listFilesRecursive(attachmentsDir),
  ]);

  const dbDumps = dbFiles.filter((f) => f.name.endsWith(".sql.gz") || f.name.endsWith(".sql"));
  const attachmentTars = attachmentFiles.filter((f) => f.name.endsWith(".tar.gz"));

  const lastDb = latestOf(dbDumps);
  const lastAttachments = latestOf(attachmentTars);
  const dbStatus = classifyFreshness(lastDb, now);
  const attachmentsStatus = classifyFreshness(lastAttachments, now);

  const history: BackupHistoryEntry[] = [
    ...dbDumps.map((f) => ({ label: "Backup database", fileName: f.name, timestamp: f.mtime, sizeBytes: f.sizeBytes })),
    ...attachmentTars.map((f) => ({ label: "Backup dokumen", fileName: f.name, timestamp: f.mtime, sizeBytes: f.sizeBytes })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, HISTORY_LIMIT);

  return {
    database: { status: dbStatus, lastBackupAt: lastDb },
    attachments: { status: attachmentsStatus, lastBackupAt: lastAttachments },
    overall: worstFreshness(dbStatus, attachmentsStatus),
    history,
  };
}
