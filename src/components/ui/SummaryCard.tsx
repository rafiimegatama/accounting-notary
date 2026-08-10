import { Card } from "./Card";

export function SummaryCard({ label, value, sub, href, tone = "default" }: { label: string; value: string; sub?: string; href?: string; tone?: "default" | "warning" | "danger" }) {
  const valueColor = tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-text";
  const content = (
    <Card className="p-4 hover:border-primary/40 transition-colors">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tracking-tight ${valueColor}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
  return href ? <a href={href}>{content}</a> : content;
}
