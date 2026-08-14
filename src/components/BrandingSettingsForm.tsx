"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import {
  ACCENT_PRESETS,
  BRANDING_TEXT_KEYS,
  brandingImageUrl,
  type BrandingSettings,
  type BrandingImageSlot,
} from "@/lib/branding";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function BrandingImageField({ slot, label, hasImage: initialHasImage }: { slot: BrandingImageSlot; label: string; hasImage: boolean }) {
  const [hasImage, setHasImage] = useState(initialHasImage);
  const [version, setVersion] = useState(() => Date.now());
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("slot", slot);
      form.append("file", file);
      await apiFetch("/api/settings/branding/image", { method: "POST", body: form });
      setHasImage(true);
      setVersion(Date.now());
      toast("success", "Gambar berhasil diunggah.");
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
      setInputKey((k) => k + 1); // resets the native file input
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/settings/branding/image?slot=${slot}`, { method: "DELETE" });
      setHasImage(false);
      toast("success", "Gambar dihapus, kembali ke tampilan warna polos.");
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        {hasImage && (
          // eslint-disable-next-line @next/next/no-img-element -- dynamically served by our own API route (not a static/importable asset), next/image's optimizer isn't applicable here for a small settings-page thumbnail
          <img
            key={version}
            src={`${brandingImageUrl(slot)}?v=${version}`}
            alt=""
            className="h-14 w-24 rounded-control border border-border object-cover"
          />
        )}
        <input key={inputKey} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} disabled={busy} className="text-xs" />
        {hasImage && (
          <Button type="button" variant="secondary" size="sm" onClick={remove} disabled={busy}>Hapus</Button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted">PNG/JPEG/WebP, maks 3MB. Gambar landscape (lebar) hasilnya paling baik.</p>
    </Field>
  );
}

export function BrandingSettingsForm({ initial }: { initial: BrandingSettings }) {
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  function set<K extends keyof BrandingSettings>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Only the text fields are ever sent here — image slots are set
      // exclusively via BrandingImageField's own upload/delete calls above.
      const updates = Object.fromEntries(BRANDING_TEXT_KEYS.map((key) => [key, values[key]]));
      await apiFetch("/api/settings/branding", { method: "POST", body: JSON.stringify({ updates }) });
      toast("success", "Branding berhasil disimpan.");
      router.refresh();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Dashboard Hero</p>
        <div className="flex flex-col gap-3">
          <Field label="Eyebrow text">
            <input className="input" value={values.branding_hero_eyebrow} onChange={(e) => set("branding_hero_eyebrow", e.target.value)} />
          </Field>
          <Field label="Subtitle">
            <input className="input" value={values.branding_hero_subtitle} onChange={(e) => set("branding_hero_subtitle", e.target.value)} />
          </Field>
          <BrandingImageField slot="hero" label="Hero background image (opsional)" hasImage={Boolean(initial.branding_hero_image)} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Login Screen</p>
        <div className="flex flex-col gap-3">
          <Field label="Hero title">
            <input className="input" value={values.branding_login_title} onChange={(e) => set("branding_login_title", e.target.value)} />
          </Field>
          <Field label="Hero subtitle">
            <input className="input" value={values.branding_login_subtitle} onChange={(e) => set("branding_login_subtitle", e.target.value)} />
          </Field>
          <BrandingImageField slot="login" label="Login panel background image (opsional)" hasImage={Boolean(initial.branding_login_image)} />
        </div>
      </div>

      <Field label="Accent color (applies to both Dashboard hero and Login panel)">
        <select className="input" value={values.branding_accent} onChange={(e) => set("branding_accent", e.target.value)}>
          {Object.entries(ACCENT_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>{preset.label}</option>
          ))}
        </select>
      </Field>
      <p className="-mt-2 text-[11px] text-muted">Jika ada background image, accent color dipakai sebagai overlay transparan supaya teks tetap terbaca.</p>

      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={busy}>Simpan Branding</Button>
      </div>
    </form>
  );
}
