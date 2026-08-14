"use client";

import { useRouter } from "next/navigation";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";

export function AgingBarChart({ data }: { data: { key: string; name: string; value: number; count: number; color: string }[] }) {
  const router = useRouter();
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) {
    return <div className="flex h-52 items-center justify-center text-sm text-muted">Tidak ada outstanding invoice.</div>;
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`} tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            formatter={(value, _name, entry) => {
              const count = (entry?.payload as { count?: number } | undefined)?.count ?? 0;
              return [`${formatCurrency(Number(value ?? 0))} (${count} invoice)`, "Outstanding"];
            }}
          />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            cursor="pointer"
            onClick={(entry) => {
              const bucket = (entry as unknown as { key: string }).key;
              if (bucket) router.push(`/invoices?aging=${bucket}`);
            }}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-xs text-muted">Klik batang untuk lihat daftar invoice per kategori.</p>
    </div>
  );
}
