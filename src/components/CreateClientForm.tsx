"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

interface ClientOption { id: string; name: string }
interface CreatedClientResponse { id: string }

export function CreateClientForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<ClientOption[]>([]);
  const router = useRouter();
  const toast = useToast();

  // Non-blocking duplicate hint only — never prevents submission (Principle
  // 3: no auto-claim/auto-block). Same debounced-search pattern already
  // used in NewTransactionModal/LinkDrawer, reused here to catch the kind
  // of accidental duplicate client already seen in this deployment's data.
  useEffect(() => {
    if (name.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(async () => {
      setMatches(await apiFetch<ClientOption[]>(`/api/clients?search=${encodeURIComponent(name.trim())}`));
    }, 250);
    return () => clearTimeout(t);
  }, [name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await apiFetch<CreatedClientResponse>(`/api/clients`, { method: "POST", body: JSON.stringify({ name }) });
      toast("success", "Client berhasil dibuat.", {
        next: "Tambah Matter jika sudah diketahui.",
        cta: [{ label: "Tambah Matter", href: `/clients/${created.id}` }],
      });
      // Bug fix: window.location.reload() wiped the toast before it could
      // ever render (full page reload tears down the ToastProvider state
      // that was just set above). router.refresh() re-fetches the Server
      // Component tree in place, same as CreateMatterForm.tsx's sibling
      // pattern, and lets the toast actually stay visible.
      router.refresh();
    } catch (err) {
      toast("error", (err as Error).message || "Client gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Client baru</Button>;
  }

  return (
    <form onSubmit={submit} className="rounded-control border border-border bg-white p-2">
      <div className="flex items-center gap-2">
        <input placeholder="Nama client" value={name} onChange={(e) => setName(e.target.value)} className="input" style={{ width: 220 }} autoFocus />
        <Button type="submit" loading={busy}>Simpan</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
      </div>
      {matches.length > 0 && (
        <p className="mt-2 text-xs text-warning">
          Client serupa sudah ada: {matches.map((m) => m.name).join(", ")}. Tetap bisa disimpan jika memang client baru.
        </p>
      )}
    </form>
  );
}
