# Coding Standard

These are conventions **already established in the codebase**, made explicit so agents extend
them consistently instead of inventing parallel patterns. When in doubt, grep for a similar
existing route/component and match its shape — don't guess a "cleaner" alternative.

## 1. API Routes

Every route handler follows this shape (`src/app/api/clients/route.ts` is the canonical example):

```ts
import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);          // 1. auth first, always
    const body = await request.json();
    if (!body.name) throw new ApiError("VALIDATION_ERROR", "name wajib diisi.");  // 2. validate

    const result = await prisma.$transaction(async (tx) => {  // 3. mutation + audit, one tx
      const created = await tx.client.create({ data: { ...body, createdBy: userId } });
      await writeAuditLog(tx, {
        entityType: "CLIENT", entityId: created.id, action: "CREATE",
        userId, newValue: created,
      });
      return created;
    });

    return apiSuccess(result, "Client berhasil dibuat.", 201);  // 4. standard envelope
  });
}
```

Rules:
- **Every** route (GET included) calls `getCurrentUser(request)` or `getCurrentSession(request)`
  first. There is no unauthenticated read endpoint — this was a real gap closed in v4
  (`UI_IMPLEMENTATION_REPORT.md §6`), don't reintroduce it.
- Every handler body is wrapped in `withApiHandler(async () => {...})` — never hand-roll
  try/catch + manual `NextResponse.json` error formatting.
- Validation errors throw `new ApiError("VALIDATION_ERROR", "<pesan dalam Bahasa Indonesia>")` —
  user-facing messages in this codebase are Indonesian; error codes are English SCREAMING_SNAKE.
- Any write that changes meaningful state happens inside `prisma.$transaction(async (tx) => {...})`
  together with its `writeAuditLog(tx, {...})` call — same `tx`, so they commit atomically. Never
  call `writeAuditLog` with the top-level `prisma` client for a mutation route.
- Success responses use `apiSuccess(data, message?, status?)`. Default status 200; use 201 for
  creation. Never construct the envelope shape by hand.
- Dynamic route params are UUIDs (`[id]`, `[entryId]`) — never `[name]`. If you need to look up by
  a human-entered value (e.g. invoice number), that's a query param or request body field, not a
  route param used as identity.

## 2. Mutation vs. Immutability

- `FinancialTransaction.amount` / `.direction` / `.transactionDate` are **never updated** after
  creation — no route should ever do `tx.financialTransaction.update({ data: { amount: ... } } )`.
  Corrections are: void the transaction (`status: "VOIDED"`, `voidReason`, `voidedBy`, `voidedAt`)
  and create a new one. If you find yourself writing an update to a financial fact field, stop —
  you've misunderstood the model. Re-read `PROJECT_RULES.md §1` constraint 5.
- There is no `DELETE` handler anywhere in `src/app/api/`, and there shouldn't be one. Enforced at
  the DB level by triggers, but the app layer should never even attempt it.

## 3. Frontend

- Server Components call `requireSession()` for page-level auth; don't rely on the middleware's
  cookie-presence check as the real gate (see `SYSTEM_OVERVIEW.md §2`).
- Shared primitives live in `src/components/ui/` — check there before adding a new button/card/badge
  variant. `StatusBadge` deliberately has three distinct badge types (Link/Review/Payment) that
  were *not* merged into one generic badge — don't "simplify" that back into a single component;
  the distinction is intentional (different status vocabularies, different meanings).
- Currency formatting always goes through `src/lib/formatCurrency.ts` — never inline
  `toLocaleString` calls scattered across components.
- No hardcoded financial values anywhere in `src/` outside tests (checked in
  `SYSTEM_CONSISTENCY_REPORT.md` check #15 — keep it that way).

## 4. Data Model Changes

- Prisma schema changes need a corresponding migration (`prisma migrate dev` locally, `migrate
  deploy` in Docker) — never hand-edit the database directly.
- Constraints/triggers Prisma can't express (CHECK constraints, `prevent_delete()`,
  `updated_at` triggers) go in the migration's raw SQL, following the exact pattern in
  `prisma/migrations/*/migration.sql` for existing tables — see `ddl_notary_financial_control.sql`
  for the authoritative reference.
- New financial tables that need immutability/no-delete guarantees must get the same trigger
  pattern as existing ones — don't ship a new financial table without it.

## 5. Language

- User-facing strings (validation messages, UI copy): Bahasa Indonesia, matching the existing
  codebase.
- Code identifiers, comments, commit messages, and this documentation set: English.
- Domain terms stay in their original language where the codebase already does this consistently
  (e.g. `rincian biaya`, `uang titipan` appear in comments/docs where precision matters more than
  translation).

## 6. Comments

- Comment the *why*, not the *what* — a hidden constraint, a workaround, a non-obvious invariant.
  The existing codebase does this well (see `src/lib/position.ts`, `src/lib/audit.ts`) — match
  that density, don't add narration of what the next line obviously does.
