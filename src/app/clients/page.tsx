import { prisma } from "@/lib/prisma";
import { CreateClientForm } from "@/components/CreateClientForm";

export default async function ClientsPage({ searchParams }: { searchParams: { search?: string } }) {
  const search = searchParams.search ?? "";
  const clients = await prisma.client.findMany({
    where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
    include: { matters: { select: { id: true } } },
  });

  return (
    <div>
      <h1>Clients</h1>
      <div style={{ marginBottom: 16 }}>
        <CreateClientForm />
      </div>
      <form action="/clients" method="get" style={{ marginBottom: 16 }}>
        <input name="search" defaultValue={search} placeholder="Cari nama client..." />
        <button type="submit">Cari</button>
      </form>

      {clients.length === 0 ? (
        <p style={{ opacity: 0.6 }}>Belum ada client.</p>
      ) : (
        <table width="100%" cellPadding={6}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th>Name</th><th>Status</th><th>Jumlah Matter</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td><a href={`/clients/${c.id}`}>{c.name}</a></td>
                <td>{c.status}</td>
                <td>{c.matters.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
