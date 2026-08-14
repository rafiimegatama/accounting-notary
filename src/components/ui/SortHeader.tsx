import type { SortDir } from "@/lib/listSort";

// Click-to-sort <th> — full page navigation via query params (no client JS
// needed). Clicking the already-active column flips direction; clicking a
// new column starts at `defaultDir`. Shared by every list page's table so
// the sort UX (and URL param shape: ?sort=&dir=) stays identical everywhere.
export function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  defaultDir = "desc",
  basePath,
  queryParams,
  align = "left",
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  currentDir: SortDir;
  defaultDir?: SortDir;
  basePath: string;
  queryParams: Record<string, string | undefined>;
  align?: "left" | "right";
}) {
  const active = currentSort === sortKey;
  const nextDir: SortDir = active ? (currentDir === "asc" ? "desc" : "asc") : defaultDir;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value) params.set(key, value);
  }
  params.set("sort", sortKey);
  params.set("dir", nextDir);

  return (
    <th className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <a href={`${basePath}?${params.toString()}`} className={`inline-flex items-center gap-1 hover:text-primary ${active ? "text-text" : ""}`}>
        {label}
        {active && <span className="text-[10px]">{currentDir === "asc" ? "▲" : "▼"}</span>}
      </a>
    </th>
  );
}
