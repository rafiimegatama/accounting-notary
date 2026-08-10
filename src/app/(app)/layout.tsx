import { requireSession } from "@/lib/requireSession";
import { prisma } from "@/lib/prisma";
import { AppShellClient } from "@/components/AppShellClient";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = requireSession(); // redirects to /login if not authenticated
  const reviewCount = await prisma.financialTransaction.count({ where: { status: "ACTIVE", reviewStatus: "REVIEW_REQUIRED" } });

  return (
    <AppShellClient staffName={session.staffName} reviewCount={reviewCount}>
      {children}
    </AppShellClient>
  );
}
