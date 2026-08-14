-- AlterTable
ALTER TABLE "disbursement" ADD COLUMN     "bank_account_id" UUID;

-- CreateTable
CREATE TABLE "bank_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bank_name" TEXT NOT NULL,
    "account_name" TEXT,
    "account_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
-- NOTE: hand-edited from Prisma's default (ON DELETE SET NULL, since this is
-- an optional/nullable relation) to ON DELETE RESTRICT. This is deliberate,
-- not a drift-fix: bank_account intentionally gets no prevent_delete()
-- trigger (see below), so RESTRICT here is the *only* protection against
-- removing a bank_account that a disbursement still refers to. schema.prisma
-- has no explicit `onDelete` on this relation on purpose — the enforced
-- constraint lives in the DDL, matching ddl_notary_financial_control.sql's
-- convention for FK columns declared inline in CREATE TABLE.
ALTER TABLE "disbursement" ADD CONSTRAINT "disbursement_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------------------------------------------------
-- Hand-added below: CHECK constraint, updated_at trigger, and audit_log
-- entity_type widening. Prisma's schema language cannot express CHECK
-- constraints or triggers (see prisma/MIGRATION_NOTES.md) — this mirrors
-- the split pattern already used in 20260810150100_constraints_and_triggers
-- and the 20260810153247_add_staff_auth / 20260810153300_staff_constraints
-- pair, applied here to Roadmap #3 ("structured per-bank disbursement
-- categorization", docs/ROADMAP.md item 3).
-- ----------------------------------------------------------------

-- CHECK constraint — mirrors client.status exactly (ACTIVE/INACTIVE, same
-- two-value lifecycle, same default).
ALTER TABLE bank_account ADD CONSTRAINT chk_bank_account_status CHECK (status IN ('ACTIVE','INACTIVE'));

-- updated_at trigger. set_updated_at() already exists (created in the
-- init/constraints_and_triggers migrations) — reused, not redefined.
CREATE TRIGGER trg_bank_account_updated_at BEFORE UPDATE ON bank_account
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Deliberately NO prevent_delete() trigger on bank_account — matches the
-- client/matter convention (not invoice/cost_detail/disbursement, which do
-- get one). Protection against deleting a bank_account still referenced by
-- a disbursement comes from the FK's ON DELETE RESTRICT above.

-- Widen audit_log.entity_type so BANK_ACCOUNT audit entries (CREATE/UPDATE/
-- STATUS_CHANGE from the new /api/bank-accounts routes) satisfy the CHECK.
-- Strictly additive: widens the allowed set only, every existing row still
-- satisfies the new constraint, fully reversible — not a destructive-
-- migration case per docs/PROJECT_RULES.md §4. Constraint name confirmed
-- against the live DB (chk_audit_entity_type, added by
-- 20260810150100_constraints_and_triggers) rather than assumed.
ALTER TABLE audit_log DROP CONSTRAINT chk_audit_entity_type;
ALTER TABLE audit_log ADD CONSTRAINT chk_audit_entity_type CHECK (entity_type IN (
  'CLIENT','MATTER','FINANCIAL_TRANSACTION','COST_DETAIL','INVOICE',
  'PAYMENT','PAYMENT_ALLOCATION','DEPOSIT','DISBURSEMENT','FINANCIAL_ATTACHMENT',
  'BANK_ACCOUNT'
));
