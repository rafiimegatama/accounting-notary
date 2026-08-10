import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

// POST /api/transactions/[id]/link — implements Step 6 Link Workflow.
// Body: { action: "LINK_CLIENT" | "LINK_MATTER" | "UNLINK", clientId?, matterId?, reason? }
// UNLINKED is a valid, permanent, non-error state — this endpoint never
// forces a client/matter selection; UNLINK is a first-class supported action.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    const { action, clientId, matterId, reason } = body;

    const transaction = await prisma.financialTransaction.findUnique({ where: { id: params.id } });
    if (!transaction) throw new ApiError("NOT_FOUND", "Transaksi tidak ditemukan.", 404);

    const previous = { clientId: transaction.clientId, matterId: transaction.matterId };
    let newClientId: string | null = transaction.clientId;
    let newMatterId: string | null = transaction.matterId;

    if (action === "LINK_CLIENT") {
      if (!clientId) throw new ApiError("VALIDATION_ERROR", "clientId wajib diisi untuk aksi LINK_CLIENT.");
      await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
      newClientId = clientId;
      newMatterId = null; // linking to client-only resets any prior matter link
    } else if (action === "LINK_MATTER") {
      if (!matterId) throw new ApiError("VALIDATION_ERROR", "matterId wajib diisi untuk aksi LINK_MATTER.");
      const matter = await prisma.matter.findUniqueOrThrow({ where: { id: matterId } });
      newClientId = matter.clientId; // matter always implies its client (Step 6)
      newMatterId = matterId;
    } else if (action === "UNLINK") {
      newClientId = null;
      newMatterId = null;
    } else {
      throw new ApiError("VALIDATION_ERROR", "action harus salah satu dari: LINK_CLIENT, LINK_MATTER, UNLINK.");
    }

    // Edge case from Step 6: relinking a transaction that already has
    // active payment allocations doesn't get blocked or auto-cascaded —
    // it gets flagged for a human to look at.
    const hasActiveAllocations = await prisma.paymentAllocation.count({
      where: { status: "ACTIVE", payment: { financialTransactionId: params.id } },
    });
    const isRelinkOfMatter =
      transaction.matterId && newMatterId && transaction.matterId !== newMatterId && hasActiveAllocations > 0;

    const auditAction =
      previous.clientId === null && previous.matterId === null && (newClientId !== null || newMatterId !== null)
        ? "LINK"
        : newClientId === null && newMatterId === null
        ? "UNLINK"
        : "RELINK";

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.financialTransaction.update({
        where: { id: params.id },
        data: {
          clientId: newClientId,
          matterId: newMatterId,
          reviewStatus: isRelinkOfMatter ? "REVIEW_REQUIRED" : transaction.reviewStatus,
        },
      });
      await writeAuditLog(tx, {
        entityType: "FINANCIAL_TRANSACTION",
        entityId: params.id,
        action: auditAction,
        userId,
        previousValue: previous,
        newValue: { clientId: newClientId, matterId: newMatterId },
        reason: reason ?? undefined,
      });
      return result;
    });

    return apiSuccess(
      updated,
      isRelinkOfMatter
        ? "Transaksi di-relink. Perhatian: transaksi ini punya alokasi pembayaran ke invoice matter sebelumnya — tinjau kembali."
        : "Transaksi berhasil di-link."
    );
  });
}
