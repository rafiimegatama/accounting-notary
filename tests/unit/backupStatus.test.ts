import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, utimes, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyFreshness,
  worstFreshness,
  describeAge,
  formatBytes,
  getBackupStatus,
} from "@/lib/backupStatus";

describe("classifyFreshness", () => {
  const now = new Date("2026-08-14T12:00:00Z");

  it("returns NOT_CONFIGURED when there is no backup at all", () => {
    expect(classifyFreshness(null, now)).toBe("NOT_CONFIGURED");
  });

  it("returns HEALTHY within the 48h threshold", () => {
    expect(classifyFreshness(new Date("2026-08-13T12:00:00Z"), now)).toBe("HEALTHY");
  });

  it("returns HEALTHY exactly at the 48h boundary", () => {
    expect(classifyFreshness(new Date("2026-08-12T12:00:00Z"), now)).toBe("HEALTHY");
  });

  it("returns WARNING just past the 48h boundary", () => {
    expect(classifyFreshness(new Date("2026-08-12T11:59:00Z"), now)).toBe("WARNING");
  });
});

describe("worstFreshness", () => {
  it("NOT_CONFIGURED dominates over anything else", () => {
    expect(worstFreshness("NOT_CONFIGURED", "HEALTHY")).toBe("NOT_CONFIGURED");
    expect(worstFreshness("HEALTHY", "NOT_CONFIGURED")).toBe("NOT_CONFIGURED");
  });

  it("WARNING beats HEALTHY", () => {
    expect(worstFreshness("WARNING", "HEALTHY")).toBe("WARNING");
  });

  it("both HEALTHY stays HEALTHY", () => {
    expect(worstFreshness("HEALTHY", "HEALTHY")).toBe("HEALTHY");
  });
});

describe("describeAge", () => {
  const now = new Date("2026-08-14T12:00:00Z");

  it("labels same-day as 'Hari ini'", () => {
    expect(describeAge(new Date("2026-08-14T01:00:00Z"), now)).toBe("Hari ini");
  });

  it("labels 1 day ago as 'Kemarin'", () => {
    expect(describeAge(new Date("2026-08-13T01:00:00Z"), now)).toBe("Kemarin");
  });

  it("labels N days ago as 'N hari lalu'", () => {
    expect(describeAge(new Date("2026-08-10T12:00:00Z"), now)).toBe("4 hari lalu");
  });
});

describe("formatBytes", () => {
  it("formats sub-1KB as bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats KB/MB/GB", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("getBackupStatus", () => {
  let root: string;
  let dbDir: string;
  let attachmentsDir: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "backup-status-test-"));
    dbDir = path.join(root, "db");
    attachmentsDir = path.join(root, "attachments");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports NOT_CONFIGURED when neither directory exists (mount not set up)", async () => {
    const status = await getBackupStatus({ dbDir, attachmentsDir });
    expect(status.database.status).toBe("NOT_CONFIGURED");
    expect(status.attachments.status).toBe("NOT_CONFIGURED");
    expect(status.overall).toBe("NOT_CONFIGURED");
    expect(status.history).toEqual([]);
  });

  it("finds the newest dump across nested daily/weekly/monthly subfolders and reports HEALTHY", async () => {
    const now = new Date("2026-08-14T12:00:00Z");
    const daily = path.join(dbDir, "daily");
    const weekly = path.join(dbDir, "weekly");
    await mkdir(daily, { recursive: true });
    await mkdir(weekly, { recursive: true });

    await writeFile(path.join(daily, "dump-old.sql.gz"), "x");
    await utimes(path.join(daily, "dump-old.sql.gz"), now, new Date("2026-08-01T00:00:00Z"));

    await writeFile(path.join(weekly, "dump-new.sql.gz"), "xx");
    await utimes(path.join(weekly, "dump-new.sql.gz"), now, new Date("2026-08-14T10:00:00Z"));

    const status = await getBackupStatus({ dbDir, attachmentsDir, now });
    expect(status.database.status).toBe("HEALTHY");
    expect(status.database.lastBackupAt?.toISOString()).toBe(new Date("2026-08-14T10:00:00Z").toISOString());
  });

  it("reports WARNING when the newest file is older than 48h, and NOT_CONFIGURED for the empty side", async () => {
    const now = new Date("2026-08-14T12:00:00Z");
    await mkdir(dbDir, { recursive: true });
    await writeFile(path.join(dbDir, "stale.sql.gz"), "x");
    await utimes(path.join(dbDir, "stale.sql.gz"), now, new Date("2026-08-01T00:00:00Z"));

    const status = await getBackupStatus({ dbDir, attachmentsDir, now });
    expect(status.database.status).toBe("WARNING");
    expect(status.attachments.status).toBe("NOT_CONFIGURED");
    expect(status.overall).toBe("NOT_CONFIGURED"); // worst of WARNING/NOT_CONFIGURED
  });

  it("builds history sorted most-recent-first, capped, from both sides", async () => {
    const now = new Date("2026-08-14T12:00:00Z");
    await mkdir(dbDir, { recursive: true });
    await mkdir(attachmentsDir, { recursive: true });

    await writeFile(path.join(dbDir, "db-1.sql.gz"), "x");
    await utimes(path.join(dbDir, "db-1.sql.gz"), now, new Date("2026-08-12T00:00:00Z"));

    await writeFile(path.join(attachmentsDir, "attachments-1.tar.gz"), "x");
    await utimes(path.join(attachmentsDir, "attachments-1.tar.gz"), now, new Date("2026-08-13T00:00:00Z"));

    const status = await getBackupStatus({ dbDir, attachmentsDir, now });
    expect(status.history.map((h) => h.fileName)).toEqual(["attachments-1.tar.gz", "db-1.sql.gz"]);
    expect(status.history[0].label).toBe("Backup dokumen");
  });

  it("ignores files that are not recognized backup artifacts", async () => {
    const now = new Date("2026-08-14T12:00:00Z");
    await mkdir(dbDir, { recursive: true });
    await writeFile(path.join(dbDir, "readme.txt"), "not a backup");

    const status = await getBackupStatus({ dbDir, attachmentsDir, now });
    expect(status.database.status).toBe("NOT_CONFIGURED");
    expect(status.history).toEqual([]);
  });
});
