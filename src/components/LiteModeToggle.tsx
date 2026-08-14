"use client";

import { useRouter } from "next/navigation";
import { LITE_MODE_COOKIE, LITE_MODE_ON } from "@/lib/liteMode";

// `initialLite` comes from the server (layout reads the cookie) so there's
// no hydration flash the way a localStorage-read-in-useEffect toggle would
// have. Toggling sets the cookie client-side, then router.refresh() re-runs
// the Server Component tree so pages that read the cookie (currently just
// the Dashboard) pick up the new value immediately.
export function LiteModeToggle({ initialLite }: { initialLite: boolean }) {
  const router = useRouter();

  function toggle() {
    document.cookie = initialLite
      ? `${LITE_MODE_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${LITE_MODE_COOKIE}=${LITE_MODE_ON}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={initialLite}
      title="Lite Mode: sembunyikan chart di Dashboard untuk tampilan lebih ringkas"
      className={`flex items-center gap-1.5 rounded-control border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        initialLite ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:bg-bg"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${initialLite ? "bg-primary" : "bg-border"}`} />
      Lite
    </button>
  );
}
