"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/apiClient";
import {
  parseCsv,
  guessColumnMapping,
  validateRows,
  type CanonicalField,
  type ValidatedRow,
} from "@/lib/excelImport";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — reasonable dev-safe limit, not an arbitrary enterprise one
const MAX_ROWS = 500;

const FIELD_LABELS: Record<CanonicalField, string> = {
  transactionDate: "Tanggal",
  description: "Keterangan",
  amountIn: "Jumlah Masuk",
  amountOut: "Jumlah Keluar",
  amount: "Jumlah",
};
const MAPPABLE_FIELDS: CanonicalField[] = ["transactionDate", "description", "amountIn", "amountOut", "amount"];

interface ImportResult {
  importedCount: number;
  failedRows: { rowIndex: number; message: string }[];
}

// Workflow Refinement Step C+D: upload -> preview -> column mapping ->
// validation/review -> commit. Commit loops the *existing*
// POST /api/transactions once per READY row (same pattern
// BulkActionToolbar already established) — no new API route, no
// EXCEL_TRANSACTION entity. clientId/matterId are never set here: every
// imported row lands UNLINKED, exactly like a manual entry with those
// fields left blank. NEEDS_REVIEW/INVALID rows are never imported and
// never silently dropped — they stay visible in the result summary.
export function ExcelImportWizard({ liteMode }: { liteMode: boolean }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<CanonicalField, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<number, { transactionDate?: string; description?: string }>>({});
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!/\.(csv)$/i.test(file.name)) {
      setError("Format tidak didukung. Gunakan file .csv (dari Excel: Save As / Export ke CSV terlebih dahulu).");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`File terlalu besar (maks ${MAX_FILE_BYTES / 1024 / 1024}MB).`);
      return;
    }
    const text = await file.text();
    const { headers: h, rows } = parseCsv(text);
    if (rows.length === 0) {
      setError("Tidak ada baris data yang terdeteksi di file ini.");
      return;
    }
    if (rows.length > MAX_ROWS) {
      setError(`File berisi ${rows.length} baris — maksimum ${MAX_ROWS} baris per import. Bagi file menjadi beberapa bagian.`);
      return;
    }
    setFileName(file.name);
    setHeaders(h);
    setRawRows(rows);
    setMapping(guessColumnMapping(h));
    setEdits({});
    setResult(null);
    setConfirming(false);
  }

  async function runImport() {
    setImporting(true);
    setConfirming(false);
    const readyRows = validated.filter((r) => r.status === "READY");
    const outcomes = await Promise.allSettled(
      readyRows.map((row) =>
        apiFetch("/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            transactionDate: row.transactionDate,
            amount: row.amount,
            direction: row.direction,
            description: row.description,
            sourceType: "EXCEL",
            sourceReference: fileName ?? undefined,
          }),
        })
      )
    );
    const failedRows = outcomes
      .map((o, i) => ({ o, row: readyRows[i] }))
      .filter(({ o }) => o.status === "rejected")
      .map(({ o, row }) => ({ rowIndex: row.rowIndex, message: (o as PromiseRejectedResult).reason?.message ?? "Gagal diimpor." }));
    setResult({ importedCount: readyRows.length - failedRows.length, failedRows });
    setImporting(false);
  }

  const validated: ValidatedRow[] = useMemo(() => {
    if (rawRows.length === 0) return [];
    // Inline fixes (Date/Keterangan) patch the underlying raw cell for that
    // row, then the whole row is re-validated from scratch — same logic
    // path as a freshly-parsed row, not a hand-merged partial object, so
    // there's exactly one place amount/date/direction get computed.
    return rawRows.map((cells, i) => {
      const rowIndex = i + 1;
      const edit = edits[rowIndex];
      let patchedCells = cells;
      if (edit) {
        patchedCells = [...cells];
        if (edit.transactionDate !== undefined && mapping.transactionDate !== undefined) {
          patchedCells[mapping.transactionDate] = edit.transactionDate;
        }
        if (edit.description !== undefined && mapping.description !== undefined) {
          patchedCells[mapping.description] = edit.description;
        }
      }
      const [row] = validateRows([patchedCells], mapping);
      return { ...row, rowIndex };
    });
  }, [rawRows, mapping, edits]);

  const counts = useMemo(() => {
    const ready = validated.filter((r) => r.status === "READY").length;
    const review = validated.filter((r) => r.status === "NEEDS_REVIEW").length;
    const invalid = validated.filter((r) => r.status === "INVALID").length;
    return { ready, review, invalid, total: validated.length };
  }, [validated]);

  const requiredFieldsMapped =
    mapping.transactionDate !== undefined &&
    mapping.description !== undefined &&
    (mapping.amountIn !== undefined || mapping.amountOut !== undefined || mapping.amount !== undefined);

  // Lite: hide the mapping table when auto-mapping already covered every
  // required field — staff shouldn't need to think about columns unless
  // something couldn't be figured out automatically.
  const showMappingTable = !liteMode || !requiredFieldsMapped;

  if (!fileName) {
    return (
      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Import Transaksi</h2></CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-muted">
            Upload file CSV (rekap bank, dsb.) untuk diimpor sebagai transaksi. Client/Matter tidak
            ditentukan otomatis — setiap baris tetap perlu di-link secara manual setelah import.
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="input"
          />
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </CardBody>
      </Card>
    );
  }

  if (result) {
    return (
      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-text">Import Selesai</h2></CardHeader>
        <CardBody>
          {(() => {
            // Painkiller #18 "Transaksi tidak tertinggal" — every number
            // here (rawRows.length, result.importedCount) already exists in
            // state; this headline just does the subtraction for the user
            // instead of making them add up the conditional lines below and
            // compare against a count from a screen they've since left.
            const total = rawRows.length;
            const skipped = total - result.importedCount;
            return (
              <div className={`mb-3 rounded-control border p-3 text-sm ${skipped > 0 ? "border-warning/30 bg-warning-bg text-warning" : "border-success/30 bg-success-bg text-success"}`}>
                {skipped > 0
                  ? `${result.importedCount} dari ${total} baris berhasil di-import, ${skipped} baris di-skip — cek detail di bawah.`
                  : `${result.importedCount} dari ${total} baris berhasil di-import — semua baris masuk.`}
              </div>
            );
          })()}
          <p className="text-sm text-text">{result.importedCount} transaksi berhasil diimpor.</p>
          {result.failedRows.length > 0 && (
            <p className="mt-1 text-sm text-danger">{result.failedRows.length} baris gagal diimpor (lihat detail di bawah).</p>
          )}
          {counts.review > 0 && <p className="mt-1 text-sm text-warning">{counts.review} baris perlu ditinjau — tidak diimpor.</p>}
          {counts.invalid > 0 && <p className="mt-1 text-sm text-muted">{counts.invalid} baris tidak valid — tidak diimpor.</p>}
          {result.failedRows.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {result.failedRows.map((f) => <li key={f.rowIndex}>Baris {f.rowIndex}: {f.message}</li>)}
            </ul>
          )}
          <div className="mt-5 flex gap-2">
            <a href="/transactions"><Button variant="secondary">Lihat Transaksi</Button></a>
            <Button
              variant="ghost"
              onClick={() => { setFileName(null); setRawRows([]); setHeaders([]); setEdits({}); setResult(null); }}
            >
              Import File Lain
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Preview: {fileName}</h2>
          <button
            onClick={() => { setFileName(null); setRawRows([]); setHeaders([]); setEdits({}); setResult(null); setConfirming(false); }}
            className="text-xs text-muted hover:text-text"
          >
            Ganti file
          </button>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-text">{rawRows.length} baris terdeteksi, {headers.length} kolom.</p>
        </CardBody>
      </Card>

      {showMappingTable && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text">Kolom Excel</h2>
            <p className="mt-0.5 text-xs text-muted">Cocokkan kolom file dengan field aplikasi. Tanggal, Keterangan, dan minimal satu kolom Jumlah wajib diisi.</p>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Kolom Excel</th>
                  <th className="px-5 py-2.5">Field Aplikasi</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => {
                  const currentField = MAPPABLE_FIELDS.find((f) => mapping[f] === i);
                  return (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5 font-medium text-text">{h || `Kolom ${i + 1}`}</td>
                      <td className="px-5 py-2.5">
                        <select
                          value={currentField ?? ""}
                          onChange={(e) => {
                            const field = e.target.value as CanonicalField | "";
                            setMapping((m) => {
                              const next = { ...m };
                              for (const f of MAPPABLE_FIELDS) if (next[f] === i) delete next[f];
                              if (field) next[field] = i;
                              return next;
                            });
                          }}
                          className="input"
                        >
                          <option value="">— tidak dipakai —</option>
                          {MAPPABLE_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {!requiredFieldsMapped && (
        <p className="text-sm text-danger">Lengkapi mapping Tanggal, Keterangan, dan minimal satu kolom Jumlah sebelum melanjutkan.</p>
      )}

      {requiredFieldsMapped && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text">Review</h2>
            <p className="mt-0.5 text-xs text-muted">
              {counts.ready} Siap Diimpor · {counts.review} Perlu Ditinjau · {counts.invalid} Baris Tidak Valid
            </p>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-5 py-2.5">Baris</th>
                    <th className="px-5 py-2.5">Tanggal</th>
                    <th className="px-5 py-2.5">Keterangan</th>
                    <th className="px-5 py-2.5">Arah</th>
                    <th className="px-5 py-2.5 text-right">Jumlah</th>
                    <th className="px-5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validated.map((row) => (
                    <tr key={row.rowIndex} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5 text-muted">{row.rowIndex}</td>
                      <td className="px-5 py-2.5">
                        <input
                          className="input"
                          defaultValue={row.transactionDate ?? row.raw[mapping.transactionDate ?? -1] ?? ""}
                          onBlur={(e) => setEdits((prev) => ({ ...prev, [row.rowIndex]: { ...prev[row.rowIndex], transactionDate: e.target.value } }))}
                        />
                      </td>
                      <td className="px-5 py-2.5">
                        <input
                          className="input"
                          defaultValue={row.description}
                          onBlur={(e) => setEdits((prev) => ({ ...prev, [row.rowIndex]: { ...prev[row.rowIndex], description: e.target.value } }))}
                        />
                      </td>
                      <td className="px-5 py-2.5">{row.direction ?? "-"}</td>
                      <td className="px-5 py-2.5 text-right">{row.amount ?? "-"}</td>
                      <td className="px-5 py-2.5">
                        <StatusBadge status={row.status} />
                        {row.reasons.length > 0 && <div className="mt-0.5 text-xs text-muted">{row.reasons.join("; ")}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {requiredFieldsMapped && !confirming && (
        <div>
          <Button disabled={counts.ready === 0} onClick={() => setConfirming(true)}>
            Import Baris Siap ({counts.ready})
          </Button>
        </div>
      )}

      {confirming && (
        <div className="flex items-center gap-3 rounded-control border border-border bg-white p-3 text-sm">
          <span>
            Import {counts.ready} transaksi ke Financial Transaction? Baris ini akan tetap UNLINKED
            sampai di-link secara manual. {counts.review + counts.invalid > 0 && `${counts.review + counts.invalid} baris lain tidak akan diimpor.`}
          </span>
          <Button loading={importing} onClick={runImport}>Ya, Import</Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={importing}>Batal</Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ValidatedRow["status"] }) {
  const map = {
    READY: { cls: "bg-success-bg text-success", label: "Siap Diimpor" },
    NEEDS_REVIEW: { cls: "bg-warning-bg text-warning", label: "Perlu Ditinjau" },
    INVALID: { cls: "bg-danger-bg text-danger", label: "Tidak Valid" },
  } as const;
  const { cls, label } = map[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
