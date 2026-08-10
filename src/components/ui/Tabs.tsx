// Server-renderable tabs driven by a URL search param (no client JS
// needed) — each tab is a plain link, active state from the current query.
export function Tabs({ tabs, active, basePath }: { tabs: { key: string; label: string }[]; active: string; basePath: string }) {
  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-6">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`${basePath}?tab=${t.key}`}
            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
              active === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
