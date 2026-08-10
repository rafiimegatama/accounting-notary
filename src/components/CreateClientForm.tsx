"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

export function CreateClientForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/clients`, { method: "POST", body: JSON.stringify({ name }) });
      toast("success", "Client berhasil dibuat.");
      window.location.reload();
    } catch (e) {
      toast("error", (e as Error).message || "Client gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Client baru</Button>;
  }

  return (
    <div className="flex items-center gap-2 rounded-control border border-border bg-white p-2">
      <input placeholder="Nama client" value={name} onChange={(e) => setName(e.target.value)} className="input" style={{ width: 220 }} autoFocus />
      <Button onClick={submit} loading={busy}>Simpan</Button>
      <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
    </div>
  );
}
