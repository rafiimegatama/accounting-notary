import { cookies } from "next/headers";
import { requireSession } from "@/lib/requireSession";
import { prisma } from "@/lib/prisma";
import { AppShellClient } from "@/components/AppShellClient";
import { LITE_MODE_COOKIE, LITE_MODE_ON } from "@/lib/liteMode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = requireSession(); // redirects to /login if not authenticated
  const reviewCount = await prisma.financialTransaction.count({ where: { status: "ACTIVE", reviewStatus: "REVIEW_REQUIRED" } });
  const liteMode = cookies().get(LITE_MODE_COOKIE)?.value === LITE_MODE_ON;

  return (
    <AppShellClient staffName={session.staffName} reviewCount={reviewCount} liteMode={liteMode}>
      {children}
    </AppShellClient>
  );
}
