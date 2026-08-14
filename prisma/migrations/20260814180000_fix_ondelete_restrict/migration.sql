-- Fixes drift found in an infra/DBA audit: ddl_notary_financial_control.sql
-- has always documented ON DELETE RESTRICT for these 9 optional FKs, but
-- schema.prisma never declared an explicit `onDelete`, so Prisma's default
-- for an optional relation (SET NULL) was what actually got applied back
-- in 20260810150040_init. This migration makes the database match the
-- documented, product-correct intent instead of the other way around:
-- Client/Matter/Invoice/CostDetail/FinancialTransaction records feed the
-- traceability model (CLAUDE.md §7 constraint 4), so a delete attempt
-- should be blocked, not silently orphan the rows that reference them.
--
-- Non-destructive, fully reversible per docs/PROJECT_RULES.md §4: pure
-- constraint-action change, no column/data change, no existing row can
-- violate a DELETE-time constraint. In this app specifically the rows on
-- the "one" side (Client/Matter/Invoice/CostDetail/FinancialTransaction)
-- are already only ever void/adjusted, never hard-deleted (see
-- prevent_delete()/prevent_financial_fact_mutation() triggers in
-- ddl_notary_financial_control.sql and CLAUDE.md §7 constraint 5) — this
-- closes the same gap for the two entities that have no such trigger
-- (Client, Matter — see ddl_notary_financial_control.sql's "No
-- prevent_delete() trigger — matches client/matter" comment on
-- bank_account) as pure defense-in-depth for any future direct-SQL
-- maintenance, not a behavior change reachable from the app today (no
-- delete UI/API exists for these entities).

-- DropForeignKey
ALTER TABLE "cost_detail" DROP CONSTRAINT "cost_detail_invoice_id_fkey";

-- AddForeignKey
ALTER TABLE "cost_detail" ADD CONSTRAINT "cost_detail_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "financial_transaction" DROP CONSTRAINT "financial_transaction_client_id_fkey";

-- AddForeignKey
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "financial_transaction" DROP CONSTRAINT "financial_transaction_matter_id_fkey";

-- AddForeignKey
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "payment_allocation" DROP CONSTRAINT "payment_allocation_invoice_id_fkey";

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "financial_attachment" DROP CONSTRAINT "financial_attachment_client_id_fkey";

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "financial_attachment" DROP CONSTRAINT "financial_attachment_matter_id_fkey";

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "financial_attachment" DROP CONSTRAINT "financial_attachment_transaction_id_fkey";

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "financial_attachment" DROP CONSTRAINT "financial_attachment_cost_detail_id_fkey";

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_cost_detail_id_fkey" FOREIGN KEY ("cost_detail_id") REFERENCES "cost_detail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "financial_attachment" DROP CONSTRAINT "financial_attachment_invoice_id_fkey";

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
