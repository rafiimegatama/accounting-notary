"use client";

import { useRouter } from "next/navigation";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";

export function UnlinkedAgingChart({
  data,
}: {
  data: { key: string; name: string; count: number; totalAmount: number; color: string; dateFrom: string | null; dateTo: string | null }[];
}) {
  const router = useRouter();
  const total = data.reduce((a, d) => a + d.count, 0);
  if (total === 0) {
    return <div className="flex h-52 items-center justify-center text-sm text-muted">Tidak ada transaksi unlinked saat ini.</div>;
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            formatter={(value, _name, entry) => {
              const amt = (entry?.payload as { totalAmount?: number } | undefined)?.totalAmount ?? 0;
              return [`${value} transaksi (${formatCurrency(amt)})`, "Unlinked"];
            }}
          />
          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            cursor="pointer"
            onClick={(entry) => {
              const row = entry as unknown as { dateFrom: string | null; dateTo: string | null };
              const params = new URLSearchParams({ linked: "unlinked" });
              if (row.dateFrom) params.set("dateFrom", row.dateFrom);
              if (row.dateTo) params.set("dateTo", row.dateTo);
              router.push(`/transactions?${params.toString()}`);
            }}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-xs text-muted">
        Klik batang untuk lihat daftar transaksi. Lama belum ter-link bukan berarti bermasalah — UNLINKED tetap valid.
      </p>
    </div>
  );
}
