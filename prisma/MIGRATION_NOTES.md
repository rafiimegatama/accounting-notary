# Migration Notes

`schema.prisma` defines tables, columns, FKs, and indexes — Prisma migrate
generates these automatically via `npm run prisma:migrate`.

Prisma does **not** generate CHECK constraints or triggers. The following
pieces from `ddl_notary_financial_control.sql` must be applied manually,
once, after the first `prisma migrate dev`:

1. All `CHECK (...)` constraints (enum-like value lists, `chk_matter_requires_client`,
   `chk_invoice_required_for_invoice_payment`, `chk_attachment_has_target`).
2. The trigger functions: `set_updated_at()`, `prevent_delete()`,
   `prevent_financial_fact_mutation()`.
3. The triggers attached to each table (see DDL: `trg_*`).

Recommended approach: after running `prisma migrate dev --name init`, open
the generated `prisma/migrations/<timestamp>_init/migration.sql` and append
the CHECK/trigger sections copied from `ddl_notary_financial_control.sql`
(everything from `-- Shared trigger functions` onward, plus each table's
CHECK constraints), so they become part of the tracked migration history
instead of a separate manual step every environment has to remember.

This split exists because Prisma's schema language has no native syntax for
triggers or multi-column CHECK constraints — it is not a shortcut or an
omission.
