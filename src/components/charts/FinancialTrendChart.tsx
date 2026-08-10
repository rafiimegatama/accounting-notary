"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency, formatDate } from "@/lib/formatCurrency";

export function FinancialTrendChart({ data }: { data: { date: string; in: number; out: number }[] }) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted">Belum ada aktivitas finansial pada periode ini.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16A34A" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#DC2626" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`} tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} width={48} />
        <Tooltip
          formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name === "in" ? "IN" : "OUT"]}
          labelFormatter={(d) => formatDate(d as string)}
        />
        <Area type="monotone" dataKey="in" stroke="#16A34A" fill="url(#colorIn)" strokeWidth={2} name="in" />
        <Area type="monotone" dataKey="out" stroke="#DC2626" fill="url(#colorOut)" strokeWidth={2} name="out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
