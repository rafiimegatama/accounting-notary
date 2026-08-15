import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

// Files live on the server's local filesystem (Step 10/CLAUDE.md: on-premise,
// no cloud storage). ATTACHMENTS_DIR should point at a path on the same
// server that hosts the Next.js process, e.g. an "attachments" folder next
// to the app — every staff PC reaches it only through the app, never a
// direct network file share.
const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), "attachments");

// GET /api/attachments?entityType=MATTER&entityId=... — one of the five
// FK columns (client/matter/transaction/costDetail/invoice), matching the
// Document/Source section of the Position screen (Step 7) and Trace (Step 8).
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    if (!entityType || !entityId) {
      throw new ApiError("VALIDATION_ERROR", "entityType dan entityId wajib diisi.");
    }

    const fieldMap: Record<string, string> = {
      CLIENT: "clientId",
      MATTER: "matterId",
      FINANCIAL_TRANSACTION: "transactionId",
      COST_DETAIL: "costDetailId",
      INVOICE: "invoiceId",
    };
    const field = fieldMap[entityType];
    if (!field) throw new ApiError("VALIDATION_ERROR", "entityType tidak dikenal.");

    const attachments = await prisma.financialAttachment.findMany({
      where: { [field]: entityId },
      orderBy: { uploadedAt: "desc" },
    });

    return apiSuccess(attachments);
  });
}

// POST /api/attachments — multipart/form-data: file + one of
// clientId/matterId/transactionId/costDetailId/invoiceId.
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("VALIDATION_ERROR", "field 'file' wajib berupa file.");

    const clientId = (form.get("clientId") as string) || null;
    const matterId = (form.get("matterId") as string) || null;
    const transactionId = (form.get("transactionId") as string) || null;
    const costDetailId = (form.get("costDetailId") as string) || null;
    const invoiceId = (form.get("invoiceId") as string) || null;

    if (!clientId && !matterId && !transactionId && !costDetailId && !invoiceId) {
      throw new ApiError("VALIDATION_ERROR", "Attachment harus dikaitkan ke minimal satu entity.");
    }

    await mkdir(ATTACHMENTS_DIR, { recursive: true });
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(ATTACHMENTS_DIR, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.financialAttachment.create({
        data: {
          filePath,
          fileName: file.name,
          fileType: file.type || null,
          clientId,
          matterId,
          transactionId,
          costDetailId,
          invoiceId,
          uploadedBy: userId,
        },
      });
      await writeAuditLog(tx, { entityType: "FINANCIAL_ATTACHMENT", entityId: created.id, action: "ATTACH", userId, newValue: created });
      return created;
    });

    return apiSuccess(attachment, "Attachment berhasil diunggah.", 201);
  });
}
