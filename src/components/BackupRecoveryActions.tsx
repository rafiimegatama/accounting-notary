"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useModalFocusTrap } from "@/components/ui/useModalFocusTrap";

// Both buttons here are DELIBERATELY informational-only — neither calls an
// API. There is no safe way for the app container to trigger the host-level
// `backup` service (would need Docker-socket access — root-equivalent host
// control, rejected as disproportionate for a button) or to run a live
// restore against the database the app itself is connected to while serving
// traffic. Faking either would violate the one rule this whole feature is
// built around: never claim something is done that wasn't. See
// docs/DEPLOYMENT.md "Backup" / "Restore drill" for the real, administrator-
// run procedures these panels point to.

export function ManualBackupInfoButton({ lastBackupLabel }: { lastBackupLabel: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const panelRef = useModalFocusTrap<HTMLDivElement>(open, close);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Buat Backup Sekarang
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-backup-info-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-card border border-border bg-card p-6 shadow-lg"
          >
            <h2 id="manual-backup-info-title" className="mb-2 text-lg font-semibold text-text">
              Backup Manual
            </h2>
            <p className="mb-3 text-sm text-text">
              Backup database dan dokumen berjalan otomatis setiap hari secara terjadwal. Backup terakhir:{" "}
              <strong>{lastBackupLabel}</strong>.
            </p>
            <p className="mb-4 text-sm text-muted">
              Membuat backup mendesak di luar jadwal adalah tindakan administrator sistem di server, bukan dari
              aplikasi ini. Hubungi administrator sistem, atau lihat panduan deployment untuk prosedurnya.
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={close}>Tutup</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const RESTORE_VERIFICATION_STEPS = [
  "Buat/pastikan backup terbaru tersedia.",
  "Siapkan lingkungan pengujian yang terisolasi (bukan server produksi).",
  "Restore backup ke lingkungan terisolasi tersebut.",
  "Jalankan aplikasi pada lingkungan tersebut.",
  "Verifikasi integritas database.",
  "Verifikasi data Client/Matter contoh.",
  "Verifikasi data Transaction.",
  "Verifikasi data Invoice.",
  "Verifikasi data Payment.",
  "Verifikasi login/autentikasi.",
  "Catat waktu verifikasi.",
];

export function RestoreInfoButton() {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showProcedure, setShowProcedure] = useState(false);

  function close() {
    setOpen(false);
    setAcknowledged(false);
    setShowProcedure(false);
  }

  const panelRef = useModalFocusTrap<HTMLDivElement>(open, close);

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Restore dari Backup
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card border border-border bg-card p-6 shadow-lg"
          >
            {!showProcedure ? (
              <>
                <h2 id="restore-title" className="mb-2 text-lg font-semibold text-danger">
                  Restore adalah tindakan berisiko tinggi
                </h2>
                <p className="mb-4 text-sm text-text">
                  Mengembalikan data dari backup dapat mengganti data aplikasi saat ini. Pastikan backup dan target
                  restore sudah diverifikasi sebelum melanjutkan.
                </p>
                <label className="mb-4 flex items-start gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-0.5"
                  />
                  Saya memahami bahwa restore dapat mengganti data saat ini.
                </label>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={close}>Batal</Button>
                  <Button variant="danger" disabled={!acknowledged} onClick={() => setShowProcedure(true)}>
                    Lanjutkan
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 id="restore-title" className="mb-2 text-lg font-semibold text-text">Prosedur Restore</h2>
                <p className="mb-3 text-sm text-muted">
                  Restore tidak dapat dijalankan dari aplikasi ini. Ini adalah tindakan administrator sistem di
                  server, mengikuti prosedur berikut (lihat juga panduan deployment):
                </p>
                <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-text">
                  {RESTORE_VERIFICATION_STEPS.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={close}>Tutup</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
