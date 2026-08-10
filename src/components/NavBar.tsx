// Server component — matches the 6-item nav from Step 14 IA. /reports is a
// reserved placeholder link (content deferred, see Step 14 decision register).
const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/transactions", label: "Financial Transactions" },
  { href: "/cost-details", label: "Cost Details" },
  { href: "/review", label: "Unlinked / Review" },
  { href: "/reports", label: "Reports / Export" },
];

export function NavBar() {
  return (
    <nav style={{ display: "flex", gap: 16, padding: "8px 12px", borderBottom: "1px solid #ddd", fontSize: 14, alignItems: "center" }}>
      {ITEMS.map((item) => (
        <a key={item.href} href={item.href}>{item.label}</a>
      ))}
      <form action="/search" method="get" style={{ marginLeft: "auto" }}>
        <input name="q" placeholder="Search..." style={{ fontSize: 13, padding: "2px 6px" }} />
      </form>
    </nav>
  );
}
