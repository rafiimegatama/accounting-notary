-- Adds everything Prisma's schema language cannot express: CHECK
-- constraints, trigger functions/triggers (immutability, no-delete,
-- updated_at), partial indexes, and system_setting seed data. See
-- prisma/MIGRATION_NOTES.md and ddl_notary_financial_control.sql (Step 11/12),
-- which this migration mirrors exactly against the tables Prisma already created.

-- ----------------------------------------------------------------
-- Trigger functions
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_delete() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Deleting rows from % is not allowed. Use status/void/reversal fields instead.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_financial_fact_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Deleting financial_transaction rows is not allowed. Use status = VOIDED instead.';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
       OR NEW.direction IS DISTINCT FROM OLD.direction THEN
      RAISE EXCEPTION 'Core financial facts (amount, transaction_date, direction) are immutable once created. Void this transaction and create a new one instead.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------
CREATE TRIGGER trg_client_updated_at BEFORE UPDATE ON client
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_matter_updated_at BEFORE UPDATE ON matter
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoice_updated_at BEFORE UPDATE ON invoice
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoice_no_delete BEFORE DELETE ON invoice
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_cost_detail_updated_at BEFORE UPDATE ON cost_detail
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cost_detail_no_delete BEFORE DELETE ON cost_detail
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_financial_transaction_updated_at BEFORE UPDATE ON financial_transaction
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_financial_transaction_immutable
  BEFORE UPDATE OR DELETE ON financial_transaction
  FOR EACH ROW EXECUTE FUNCTION prevent_financial_fact_mutation();

CREATE TRIGGER trg_payment_updated_at BEFORE UPDATE ON payment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payment_no_delete BEFORE DELETE ON payment
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_deposit_updated_at BEFORE UPDATE ON deposit
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_deposit_no_delete BEFORE DELETE ON deposit
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_disbursement_updated_at BEFORE UPDATE ON disbursement
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_disbursement_no_delete BEFORE DELETE ON disbursement
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_payment_allocation_no_delete BEFORE DELETE ON payment_allocation
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_financial_attachment_no_delete BEFORE DELETE ON financial_attachment
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

CREATE TRIGGER trg_audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ----------------------------------------------------------------
-- CHECK constraints
-- ----------------------------------------------------------------
ALTER TABLE client ADD CONSTRAINT chk_client_type CHECK (client_type IN ('INDIVIDUAL','COMPANY'));
ALTER TABLE client ADD CONSTRAINT chk_client_status CHECK (status IN ('ACTIVE','INACTIVE'));

ALTER TABLE matter ADD CONSTRAINT chk_matter_status CHECK (status IN ('ACTIVE','CLOSED','CANCELLED'));

ALTER TABLE invoice ADD CONSTRAINT chk_invoice_total_amount CHECK (total_amount > 0);
ALTER TABLE invoice ADD CONSTRAINT chk_invoice_status CHECK (status IN ('DRAFT','ISSUED','VOID'));

ALTER TABLE cost_detail ADD CONSTRAINT chk_cost_detail_amount CHECK (amount >= 0);
ALTER TABLE cost_detail ADD CONSTRAINT chk_cost_detail_source_type CHECK (
  source_type IN ('INTERNAL_SYSTEM','EXCEL','BANK_STATEMENT','WORD','WHATSAPP','PDF','IMAGE','MANUAL','OTHER','SOURCE_PENDING')
);
ALTER TABLE cost_detail ADD CONSTRAINT chk_cost_detail_status CHECK (status IN ('ACTIVE','VOID'));

ALTER TABLE financial_transaction ADD CONSTRAINT chk_txn_amount CHECK (amount > 0);
ALTER TABLE financial_transaction ADD CONSTRAINT chk_txn_direction CHECK (direction IN ('IN','OUT'));
ALTER TABLE financial_transaction ADD CONSTRAINT chk_txn_financial_type CHECK (
  financial_type IN ('UNCLASSIFIED','PAYMENT','DEPOSIT','DISBURSEMENT','OTHER')
);
ALTER TABLE financial_transaction ADD CONSTRAINT chk_txn_source_type CHECK (
  source_type IN ('INTERNAL_SYSTEM','EXCEL','BANK_STATEMENT','WORD','WHATSAPP','PDF','IMAGE','MANUAL','OTHER','SOURCE_PENDING')
);
ALTER TABLE financial_transaction ADD CONSTRAINT chk_txn_review_status CHECK (review_status IN ('NORMAL','WARNING','REVIEW_REQUIRED'));
ALTER TABLE financial_transaction ADD CONSTRAINT chk_txn_status CHECK (status IN ('ACTIVE','VOIDED'));
ALTER TABLE financial_transaction ADD CONSTRAINT chk_matter_requires_client CHECK (matter_id IS NULL OR client_id IS NOT NULL);

ALTER TABLE payment_allocation ADD CONSTRAINT chk_alloc_amount CHECK (amount > 0);
ALTER TABLE payment_allocation ADD CONSTRAINT chk_alloc_type CHECK (allocation_type IN ('INVOICE_PAYMENT','DEPOSIT_TOPUP','OTHER'));
ALTER TABLE payment_allocation ADD CONSTRAINT chk_alloc_status CHECK (status IN ('ACTIVE','REVERSED'));
ALTER TABLE payment_allocation ADD CONSTRAINT chk_invoice_required_for_invoice_payment CHECK (
  (allocation_type = 'INVOICE_PAYMENT' AND invoice_id IS NOT NULL) OR (allocation_type <> 'INVOICE_PAYMENT')
);

ALTER TABLE financial_attachment ADD CONSTRAINT chk_attachment_has_target CHECK (
  client_id IS NOT NULL OR matter_id IS NOT NULL OR transaction_id IS NOT NULL
  OR cost_detail_id IS NOT NULL OR invoice_id IS NOT NULL
);

ALTER TABLE audit_log ADD CONSTRAINT chk_audit_entity_type CHECK (entity_type IN (
  'CLIENT','MATTER','FINANCIAL_TRANSACTION','COST_DETAIL','INVOICE',
  'PAYMENT','PAYMENT_ALLOCATION','DEPOSIT','DISBURSEMENT','FINANCIAL_ATTACHMENT'
));
ALTER TABLE audit_log ADD CONSTRAINT chk_audit_action CHECK (action IN (
  'CREATE','UPDATE','LINK','RELINK','UNLINK','ALLOCATE','REVERSE_ALLOCATION','STATUS_CHANGE','ATTACH','VOID','ADJUSTMENT'
));

-- ----------------------------------------------------------------
-- Partial indexes (not expressible via Prisma's @@index) — Step 12
-- ----------------------------------------------------------------
CREATE INDEX idx_txn_unlinked ON financial_transaction (created_at)
  WHERE client_id IS NULL AND matter_id IS NULL;
CREATE INDEX idx_txn_review_required ON financial_transaction (created_at)
  WHERE review_status <> 'NORMAL';
CREATE INDEX idx_txn_source_pending ON financial_transaction (created_at)
  WHERE source_type = 'SOURCE_PENDING';

CREATE INDEX idx_attach_transaction ON financial_attachment (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_attach_matter      ON financial_attachment (matter_id)      WHERE matter_id IS NOT NULL;
CREATE INDEX idx_attach_client      ON financial_attachment (client_id)      WHERE client_id IS NOT NULL;
CREATE INDEX idx_attach_cost_detail ON financial_attachment (cost_detail_id) WHERE cost_detail_id IS NOT NULL;
CREATE INDEX idx_attach_invoice     ON financial_attachment (invoice_id)     WHERE invoice_id IS NOT NULL;

CREATE INDEX idx_client_name ON client (name);

-- ----------------------------------------------------------------
-- Seed data — Step 9 configurable defaults
-- ----------------------------------------------------------------
INSERT INTO system_setting (key, value, updated_by) VALUES
  ('default_allow_partial_payment', 'true', 'system_seed'),
  ('warn_on_missing_source', 'true', 'system_seed')
ON CONFLICT (key) DO NOTHING;
