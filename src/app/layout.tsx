import { StaffIdentityBar } from "@/components/StaffIdentityBar";
import { NavBar } from "@/components/NavBar";

export const metadata = {
  title: "Notary Financial Control System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <StaffIdentityBar />
        <NavBar />
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>{children}</div>
      </body>
    </html>
  );
}
