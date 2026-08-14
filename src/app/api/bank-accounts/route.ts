import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

// Roadmap #3 — structured per-bank disbursement categorization. Lookup/
// typeahead source for the disbursement entry UI's funding-bank dropdown,
// plus create. Mirrors src/app/api/clients/route.ts exactly.
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const bankAccounts = await prisma.bankAccount.findMany({
      where: search ? { bankName: { contains: search, mode: "insensitive" } } : undefined,
      orderBy: { bankName: "asc" },
    });
    return apiSuccess(bankAccounts);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    if (!body.bankName) throw new ApiError("VALIDATION_ERROR", "bankName wajib diisi.");

    const bankAccount = await prisma.$transaction(async (tx) => {
      const created = await tx.bankAccount.create({
        data: {
          bankName: body.bankName,
          accountName: body.accountName ?? null,
          accountNumber: body.accountNumber ?? null,
          notes: body.notes ?? null,
          createdBy: userId,
        },
      });
      await writeAuditLog(tx, { entityType: "BANK_ACCOUNT", entityId: created.id, action: "CREATE", userId, newValue: created });
      return created;
    });

    return apiSuccess(bankAccount, "Bank account berhasil dibuat.", 201);
  });
}
