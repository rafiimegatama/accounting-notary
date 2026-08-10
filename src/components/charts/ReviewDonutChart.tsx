"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function ReviewDonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) {
    return <div className="flex h-52 items-center justify-center text-sm text-muted">Belum ada transaksi.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value, name) => [`${value} transaksi`, name]} />
        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
