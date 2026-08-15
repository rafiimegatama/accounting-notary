-- AlterTable
ALTER TABLE "staff" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------------
-- Hand-added below: audit_log entity_type/action widening, matching the
-- exact drop/re-add pattern already used by 20260812155645_add_bank_account
-- (constraint name confirmed against that migration rather than assumed).
-- Strictly additive: widens the allowed set only, every existing row still
-- satisfies the new constraint, fully reversible — not a destructive-
-- migration case per docs/PROJECT_RULES.md §4.
-- ----------------------------------------------------------------
ALTER TABLE audit_log DROP CONSTRAINT chk_audit_entity_type;
ALTER TABLE audit_log ADD CONSTRAINT chk_audit_entity_type CHECK (entity_type IN (
  'CLIENT','MATTER','FINANCIAL_TRANSACTION','COST_DETAIL','INVOICE',
  'PAYMENT','PAYMENT_ALLOCATION','DEPOSIT','DISBURSEMENT','FINANCIAL_ATTACHMENT',
  'BANK_ACCOUNT','STAFF'
));

ALTER TABLE audit_log DROP CONSTRAINT chk_audit_action;
ALTER TABLE audit_log ADD CONSTRAINT chk_audit_action CHECK (action IN (
  'CREATE','UPDATE','LINK','RELINK','UNLINK','ALLOCATE','REVERSE_ALLOCATION',
  'STATUS_CHANGE','ATTACH','VOID','ADJUSTMENT','PIN_RESET'
));

-- ----------------------------------------------------------------
-- Bootstrap the first admin — explicitly requested for this one named
-- staff member, matching the "restricted to one trusted person for now"
-- decision (Irfani Utami; Pani/Dewi Anggraini/Sri Wahyuni remain regular
-- staff, resettable but not able to reset anyone themselves). A one-time,
-- named, deliberate grant, not a default anyone gets — same data-seeding
-- precedent as the system_setting INSERT in
-- 20260810150100_constraints_and_triggers. No-op (matches 0 rows) in any
-- environment without a staff member named exactly "Irfani Utami" — e.g.
-- CI's ephemeral test database, or a fresh seed:demo run. See
-- scripts/break-glass-reset-pin.sh for the fallback if this one admin ever
-- gets locked out too.
-- ----------------------------------------------------------------
UPDATE staff SET is_admin = true WHERE name = 'Irfani Utami';
