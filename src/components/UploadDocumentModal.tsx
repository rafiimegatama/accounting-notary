"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { useModalFocusTrap } from "@/components/ui/useModalFocusTrap";

// Trigger button is deliberately one size class larger than sibling action
// buttons (size="md" vs the "sm" used by e.g. AddCostDetailModal) — per
// explicit user feedback that document upload was invisible/hard to find
// on the Client/Matter position pages. Modal itself follows the same
// structure as AddCostDetailModal.tsx (trigger + overlay <form>, useState
// for open/busy/error, useRouter().refresh() + useToast() on success).
export function UploadDocumentModal({ clientId, matterId }: { clientId?: string; matterId?: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  function close() {
    setOpen(false);
    setFile(null);
    setError(null);
  }

  const panelRef = useModalFocusTrap<HTMLFormElement>(open, close);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (clientId) formData.append("clientId", clientId);
      if (matterId) formData.append("matterId", matterId);
      await apiFetch("/api/attachments", { method: "POST", body: formData });
      toast("success", "Dokumen berhasil diunggah.");
      close();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        <UploadIcon />
        Upload Dokumen
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <form ref={panelRef} onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md rounded-card bg-card p-6 shadow-lg border border-border">
            <h2 className="mb-4 text-lg font-semibold text-text">Upload Dokumen</h2>
            <label className="mb-1 block text-xs font-medium text-text">File</label>
            <input
              required
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input mb-1"
            />
            {file && <p className="mb-3 text-xs text-muted">{file.name}</p>}
            {error && <p className="mb-3 text-sm text-danger">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>Batal</Button>
              <Button type="submit" loading={busy} disabled={!file}>Upload</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// Standard "upload" glyph (upward arrow into a tray), stroke-based to match
// the icon conventions already used across Sidebar.tsx and the file icon in
// FinancialPositionView.tsx's Sources & Documents list.
export function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3" />
      <path d="M7 8l5-5 5 5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}
