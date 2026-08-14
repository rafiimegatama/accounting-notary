"use client";

import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function ReviewDonutChart({ data }: { data: { key: string; name: string; value: number; color: string }[] }) {
  const router = useRouter();
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) {
    return <div className="flex h-52 items-center justify-center text-sm text-muted">Belum ada transaksi.</div>;
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            cursor="pointer"
            onClick={(entry) => {
              const status = (entry as unknown as { key: string }).key;
              if (status) router.push(`/transactions?reviewStatus=${status}`);
            }}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value, name) => [`${value} transaksi`, name]} />
          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-xs text-muted">Klik segmen untuk lihat daftar transaksi.</p>
    </div>
  );
}
