import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const matterId = searchParams.get("matterId") ?? undefined;
    const invoices = await prisma.invoice.findMany({
      where: matterId ? { matterId } : undefined,
      orderBy: { invoiceDate: "desc" },
    });
    return apiSuccess(invoices);
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    const { matterId, invoiceNumber, invoiceDate, dueDate, totalAmount, allowPartialPayment, notes } = body;
    if (!matterId || !invoiceNumber || !invoiceDate || !totalAmount) {
      throw new ApiError("VALIDATION_ERROR", "matterId, invoiceNumber, invoiceDate, totalAmount wajib diisi.");
    }
    await prisma.matter.findUniqueOrThrow({ where: { id: matterId } });

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          matterId,
          invoiceNumber,
          invoiceDate: new Date(invoiceDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          totalAmount,
          allowPartialPayment: allowPartialPayment ?? true,
          notes: notes ?? null,
          createdBy: userId,
        },
      });
      await writeAuditLog(tx, { entityType: "INVOICE", entityId: created.id, action: "CREATE", userId, newValue: created });
      return created;
    });

    return apiSuccess(invoice, "Invoice berhasil dibuat.", 201);
  });
}
