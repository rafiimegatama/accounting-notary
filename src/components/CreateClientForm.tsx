"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiClient";

export function CreateClientForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/clients`, { method: "POST", body: JSON.stringify({ name }) });
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)}>+ Client baru</button>;
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 16, display: "inline-block" }}>
      <input placeholder="Nama client" value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={submit} disabled={busy} style={{ marginLeft: 8 }}>{busy ? "Menyimpan..." : "Simpan"}</button>
      <button onClick={() => setOpen(false)} style={{ marginLeft: 8 }}>Batal</button>
      {error && <p style={{ color: "crimson", fontSize: 12 }}>{error}</p>}
    </div>
  );
}
