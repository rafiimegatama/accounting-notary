import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";

// Autocomplete source of truth for the "Source Reference" field on New
// Transaction: distinct values already used on past transactions, not a
// separate lookup table. Deterministic substring match only — NOT AI, NOT
// fuzzy/semantic matching, same constraint as Typeahead.tsx (CLAUDE.md
// constraint 3). Free text always remains valid; this is a convenience list.
export async function GET(request: Request) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    if (search.trim().length < 2) return apiSuccess([]);

    const rows = await prisma.financialTransaction.findMany({
      where: { sourceReference: { contains: search, mode: "insensitive" } },
      distinct: ["sourceReference"],
      orderBy: { createdAt: "desc" },
      select: { sourceReference: true },
      take: 8,
    });

    return apiSuccess(rows.map((r) => r.sourceReference).filter((v): v is string => Boolean(v)));
  });
}
