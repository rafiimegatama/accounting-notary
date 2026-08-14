import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";
import { checkInvoiceNumberSequence, extractInvoiceYear, suggestNextInvoiceNumber } from "@/lib/invoiceNumbering";

// GET /api/invoices?matterId=...                    -> Invoice[] (unchanged default shape)
// GET /api/invoices?suggestNext=true[&year=YYYY]     -> { suggestedInvoiceNumber, year }
//   Roadmap #1 (Sequential invoice numbering): office-confirmed scheme is
//   per-year reset, INV-{year}-{3-digit seq} (format matched against real
//   seeded invoices, see scripts/seed-demo.ts). Reuses the same pure
//   suggestNextInvoiceNumber() the client previously ran locally after
//   fetching every invoice (CreateInvoiceModal.tsx) — this just moves the
//   computation server-side and adds an explicit ?year override. year
//   defaults to the current calendar year when omitted.
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);

    if (searchParams.get("suggestNext") === "true") {
      const yearParam = searchParams.get("year");
      if (yearParam && !/^\d{4}$/.test(yearParam)) {
        throw new ApiError("VALIDATION_ERROR", "year harus berupa tahun 4 digit yang valid.");
      }
      const year = yearParam ? Number(yearParam) : new Date().getFullYear();

      // Prefix-filtered at the DB level so this doesn't have to pull every
      // invoice ever created just to look at one year's worth of numbers —
      // suggestNextInvoiceNumber() would ignore the rest anyway, this just
      // avoids transferring them. Non-matching numbers within the prefix
      // (e.g. "INV-2026-abc") are still filtered out by the regex inside it.
      const existing = await prisma.invoice.findMany({
        where: { invoiceNumber: { startsWith: `INV-${year}-` } },
        select: { invoiceNumber: true },
      });
      const suggestedInvoiceNumber = suggestNextInvoiceNumber(existing.map((i) => i.invoiceNumber), year);
      return apiSuccess({ suggestedInvoiceNumber, year });
    }

    const matterId = searchParams.get("matterId") ?? undefined;
    const invoices = await prisma.invoice.findMany({
      where: matterId ? { matterId } : undefined,
      orderBy: { invoiceDate: "desc" },
      // Roadmap #1 remaining-balance polish (PAINKILLER_COVERAGE_AUDIT.md §7.4):
      // additive field only — same active-allocations-only shape already used
      // by dashboard.ts/position.ts to compute outstanding, so AllocateInline
      // can show "sisa tagihan" without a second endpoint or a new query shape.
      include: { allocations: { where: { status: "ACTIVE" }, select: { amount: true } } },
    });
    return apiSuccess(invoices);
  });
}

// POST /api/invoices — manual invoiceNumber entry stays fully supported
// (numbering exceptions are real, per ROADMAP.md #1) and is never rejected
// for breaking sequence: CLAUDE.md §7 point 7 requires this stay a soft
// warning, not a blocking error. sequenceWarning is computed, not stored —
// invoiceNumber remains a plain string column (no schema change) and the
// audit log's newValue continues to reflect exactly what was persisted.
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    const { matterId, invoiceNumber, invoiceDate, dueDate, totalAmount, allowPartialPayment, notes } = body;
    if (!matterId || !invoiceNumber || !invoiceDate || !totalAmount) {
      throw new ApiError("VALIDATION_ERROR", "matterId, invoiceNumber, invoiceDate, totalAmount wajib diisi.");
    }
    await prisma.matter.findUniqueOrThrow({ where: { id: matterId } });

    let sequenceWarning: string | null = null;
    const sequenceYear = extractInvoiceYear(invoiceNumber);
    if (sequenceYear !== null) {
      const existingForYear = await prisma.invoice.findMany({
        where: { invoiceNumber: { startsWith: `INV-${sequenceYear}-` } },
        select: { invoiceNumber: true },
      });
      sequenceWarning = checkInvoiceNumberSequence(invoiceNumber, existingForYear.map((i) => i.invoiceNumber));
    }

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

    return apiSuccess({ ...invoice, sequenceWarning }, "Invoice berhasil dibuat.", 201);
  });
}
