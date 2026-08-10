import { Card, CardBody } from "@/components/ui/Card";

// Section 21 — minimal MVP reports. Each card links to the actual page
// that already computes these numbers server-side (Section 31: never a
// second, independent frontend calculation) rather than re-deriving
// anything here. Transaction History additionally offers a CSV export.
const REPORTS = [
  { title: "Matter Financial Position", description: "Posisi finansial per matter — cost, invoice, paid, outstanding, deposit.", href: "/clients?tab=matters" },
  { title: "Client Financial Position", description: "Posisi finansial per client, teragregasi dari semua matter-nya.", href: "/clients" },
  { title: "Outstanding Invoice", description: "Semua invoice dengan sisa outstanding.", href: "/invoices" },
  { title: "Client Funds / Deposit", description: "Saldo titipan per matter.", href: "/deposits" },
  { title: "Transaction History", description: "Seluruh transaksi finansial, bisa difilter per client/matter/tanggal.", href: "/transactions" },
  { title: "Review Items", description: "Item yang membutuhkan perhatian (Warning / Review Required).", href: "/review" },
];

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Reports</h1>
        <p className="text-sm text-muted">Setiap laporan menampilkan data yang sama dengan halaman aslinya — tidak ada perhitungan kedua di sini.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <a key={r.title} href={r.href}>
            <Card className="h-full p-5 hover:border-primary/40 transition-colors">
              <h2 className="text-sm font-semibold text-text">{r.title}</h2>
              <p className="mt-1 text-xs text-muted">{r.description}</p>
            </Card>
          </a>
        ))}
      </div>

      <Card>
        <CardBody className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text">Export Transaction History (CSV)</h2>
            <p className="text-xs text-muted">Export seluruh transaksi aktif ke file CSV.</p>
          </div>
          <a href="/api/reports/transactions/export" className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Download CSV
          </a>
        </CardBody>
      </Card>
    </div>
  );
}
