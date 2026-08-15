-- ================================================================
-- NOTARY FINANCIAL CONTROL SYSTEM — DDL
-- ================================================================
-- Target: PostgreSQL (on-premise, single office server, LAN access)
-- Generated: Step 11 of master implementation prompt.
-- See CLAUDE.md for product context and design constraints.
--
-- Core principle enforced at schema level:
--   Financial records are never hard-deleted. Corrections use
--   status transitions (ACTIVE -> VOIDED / REVERSED) plus AUDIT_LOG,
--   never UPDATE of core facts or DELETE.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- provides gen_random_uuid() on older PG versions

-- ----------------------------------------------------------------
-- Shared trigger functions
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

-- ================================================================
-- CLIENT
-- ================================================================
CREATE TABLE client (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  client_type       TEXT CHECK (client_type IN ('INDIVIDUAL','COMPANY')),
  contact_phone     TEXT,
  contact_email     TEXT,
  contact_address   TEXT,
  identity_number   TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  notes             TEXT,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_client_updated_at BEFORE UPDATE ON client
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ================================================================
-- MATTER
-- ================================================================
CREATE TABLE matter (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES client(id) ON DELETE RESTRICT,
  matter_name         TEXT NOT NULL,
  matter_type         TEXT,
  service             TEXT,
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED','CANCELLED')),
  responsible_staff   TEXT,
  notes               TEXT,
  created_by          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_matter_updated_at BEFORE UPDATE ON matter
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ================================================================
-- INVOICE
-- ================================================================
-- NOTE: payment_status (UNPAID/PARTIALLY_PAID/PAID/OVERPAID) is NOT
-- a stored column — it is derived at query time from total_amount
-- vs SUM(payment_allocation.amount). `status` below is invoice
-- lifecycle only (draft/issued/void), a different axis.
CREATE TABLE invoice (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id               UUID NOT NULL REFERENCES matter(id) ON DELETE RESTRICT,
  invoice_number          TEXT NOT NULL UNIQUE,
  invoice_date            DATE NOT NULL,
  due_date                DATE,
  total_amount            NUMERIC(18,2) NOT NULL CHECK (total_amount > 0),
  allow_partial_payment   BOOLEAN NOT NULL DEFAULT true,
  status                  TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT','ISSUED','VOID')),
  notes                   TEXT,
  created_by              TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_invoice_updated_at BEFORE UPDATE ON invoice
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoice_no_delete BEFORE DELETE ON invoice
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ================================================================
-- COST_DETAIL  (rincian biaya — itemization per matter)
-- ================================================================
CREATE TABLE cost_detail (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id        UUID NOT NULL REFERENCES matter(id) ON DELETE RESTRICT,
  invoice_id       UUID REFERENCES invoice(id) ON DELETE RESTRICT, -- set once this cost item has been billed
  cost_date        DATE NOT NULL,
  description      TEXT NOT NULL,
  category         TEXT, -- free text; taxonomy UNKNOWN, see Step 4/9 unknowns
  amount           NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  source_type      TEXT NOT NULL DEFAULT 'MANUAL'
                     CHECK (source_type IN ('INTERNAL_SYSTEM','EXCEL','BANK_STATEMENT','WORD',
                                             'WHATSAPP','PDF','IMAGE','MANUAL','OTHER','SOURCE_PENDING')),
  source_reference TEXT,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOID')),
  notes            TEXT,
  created_by       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_cost_detail_updated_at BEFORE UPDATE ON cost_detail
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cost_detail_no_delete BEFORE DELETE ON cost_detail
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ================================================================
-- FINANCIAL_TRANSACTION (raw fact — root of everything)
-- ================================================================
CREATE TABLE financial_transaction (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date   DATE NOT NULL,
  amount             NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  direction          TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  description        TEXT NOT NULL,
  financial_type     TEXT NOT NULL DEFAULT 'UNCLASSIFIED'
                       CHECK (financial_type IN ('UNCLASSIFIED','PAYMENT','DEPOSIT','DISBURSEMENT','OTHER')),
  client_id          UUID REFERENCES client(id) ON DELETE RESTRICT,
  matter_id          UUID REFERENCES matter(id) ON DELETE RESTRICT,
  source_type        TEXT NOT NULL DEFAULT 'SOURCE_PENDING'
                       CHECK (source_type IN ('INTERNAL_SYSTEM','EXCEL','BANK_STATEMENT','WORD',
                                               'WHATSAPP','PDF','IMAGE','MANUAL','OTHER','SOURCE_PENDING')),
  source_reference   TEXT,
  review_status      TEXT NOT NULL DEFAULT 'NORMAL' CHECK (review_status IN ('NORMAL','WARNING','REVIEW_REQUIRED')),
  status             TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
  voided_at          TIMESTAMPTZ,
  voided_by          TEXT,
  void_reason        TEXT,
  notes              TEXT,
  created_by         TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_matter_requires_client CHECK (matter_id IS NULL OR client_id IS NOT NULL)
);

CREATE TRIGGER trg_financial_transaction_updated_at BEFORE UPDATE ON financial_transaction
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Enforces immutability of amount/date/direction and blocks DELETE outright.
-- Must run AFTER set_updated_at in practice (both BEFORE UPDATE) — order doesn't
-- matter here since this trigger only inspects amount/transaction_date/direction.
CREATE TRIGGER trg_financial_transaction_immutable
  BEFORE UPDATE OR DELETE ON financial_transaction
  FOR EACH ROW EXECUTE FUNCTION prevent_financial_fact_mutation();

-- ================================================================
-- PAYMENT  (classification: financial_transaction recognized as a payment)
-- ================================================================
CREATE TABLE payment (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_transaction_id  UUID NOT NULL UNIQUE REFERENCES financial_transaction(id) ON DELETE RESTRICT,
  notes                     TEXT,
  created_by                TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_payment_updated_at BEFORE UPDATE ON payment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payment_no_delete BEFORE DELETE ON payment
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ================================================================
-- DEPOSIT  (classification: financial_transaction recognized as client funds/titipan)
-- ================================================================
CREATE TABLE deposit (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_transaction_id  UUID NOT NULL UNIQUE REFERENCES financial_transaction(id) ON DELETE RESTRICT,
  notes                     TEXT,
  created_by                TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_deposit_updated_at BEFORE UPDATE ON deposit
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_deposit_no_delete BEFORE DELETE ON deposit
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ================================================================
-- BANK_ACCOUNT  (funding bank/account for a Disbursement — Roadmap #3,
-- "structured per-bank disbursement categorization". Additive to, not a
-- replacement for, disbursement.category which stays free text describing
-- what the money was spent on.)
-- ================================================================
CREATE TABLE bank_account (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name         TEXT NOT NULL,
  account_name      TEXT, -- e.g. "Operasional" / "RPL Notaris"
  account_number    TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  notes             TEXT,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bank_account_updated_at BEFORE UPDATE ON bank_account
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- No prevent_delete() trigger — matches client/matter, not
-- invoice/cost_detail/disbursement. A bank_account still referenced by a
-- disbursement is protected by that FK's ON DELETE RESTRICT instead (see
-- disbursement.bank_account_id below).

-- ================================================================
-- DISBURSEMENT  (classification: financial_transaction paid out on behalf of client)
-- ================================================================
CREATE TABLE disbursement (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_transaction_id  UUID NOT NULL UNIQUE REFERENCES financial_transaction(id) ON DELETE RESTRICT,
  category                  TEXT, -- e.g. BPHTB, PNBP, biaya pihak ketiga; taxonomy UNKNOWN
  bank_account_id           UUID REFERENCES bank_account(id) ON DELETE RESTRICT, -- funding bank/account; nullable. Not DB-immutable (no trigger blocks UPDATE on this table besides no-delete) — set-once-at-classify-time is an application-layer convention only, same as category has always been (no PATCH route exists for either)
  notes                     TEXT,
  created_by                TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_disbursement_updated_at BEFORE UPDATE ON disbursement
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_disbursement_no_delete BEFORE DELETE ON disbursement
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ================================================================
-- PAYMENT_ALLOCATION  (distributes a payment across invoice(s)/deposit)
-- ================================================================
CREATE TABLE payment_allocation (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        UUID NOT NULL REFERENCES payment(id) ON DELETE RESTRICT,
  invoice_id        UUID REFERENCES invoice(id) ON DELETE RESTRICT, -- NULL = allocated to deposit/other, not a specific invoice
  allocation_type   TEXT NOT NULL CHECK (allocation_type IN ('INVOICE_PAYMENT','DEPOSIT_TOPUP','OTHER')),
  amount            NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVERSED')),
  reversed_at       TIMESTAMPTZ,
  reversed_by       TEXT,
  reversal_reason   TEXT,
  notes             TEXT,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_invoice_required_for_invoice_payment CHECK (
    (allocation_type = 'INVOICE_PAYMENT' AND invoice_id IS NOT NULL) OR
    (allocation_type <> 'INVOICE_PAYMENT')
  )
);

CREATE TRIGGER trg_payment_allocation_no_delete BEFORE DELETE ON payment_allocation
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();
-- NOTE: no immutability trigger blocking UPDATE here beyond DELETE — reversal is
-- expressed by UPDATE-ing status/reversed_* columns, which must remain writable.

-- ================================================================
-- FINANCIAL_ATTACHMENT
-- ================================================================
CREATE TABLE financial_attachment (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path      TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  file_type      TEXT,
  client_id        UUID REFERENCES client(id) ON DELETE RESTRICT,
  matter_id        UUID REFERENCES matter(id) ON DELETE RESTRICT,
  transaction_id   UUID REFERENCES financial_transaction(id) ON DELETE RESTRICT,
  cost_detail_id   UUID REFERENCES cost_detail(id) ON DELETE RESTRICT,
  invoice_id       UUID REFERENCES invoice(id) ON DELETE RESTRICT,
  uploaded_by    TEXT NOT NULL,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_attachment_has_target CHECK (
    client_id IS NOT NULL OR matter_id IS NOT NULL OR transaction_id IS NOT NULL
    OR cost_detail_id IS NOT NULL OR invoice_id IS NOT NULL
  )
);

CREATE TRIGGER trg_financial_attachment_no_delete BEFORE DELETE ON financial_attachment
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ================================================================
-- AUDIT_LOG (append-only; also serves as the FINANCIAL_EVENT/timeline source — see Step 4 decision)
-- ================================================================
-- entity_id is intentionally NOT a foreign key: this table is polymorphic
-- across entity_type, and referential integrity for it is enforced at the
-- application layer. This is the one deliberate exception to FK-everywhere
-- in this schema, necessary for a generic audit log.
CREATE TABLE audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      TEXT NOT NULL CHECK (entity_type IN (
                      'CLIENT','MATTER','FINANCIAL_TRANSACTION','COST_DETAIL','INVOICE',
                      'PAYMENT','PAYMENT_ALLOCATION','DEPOSIT','DISBURSEMENT','FINANCIAL_ATTACHMENT',
                      'BANK_ACCOUNT','STAFF'
                    )),
  entity_id        UUID NOT NULL,
  action           TEXT NOT NULL CHECK (action IN (
                      'CREATE','UPDATE','LINK','RELINK','UNLINK','ALLOCATE',
                      'REVERSE_ALLOCATION','STATUS_CHANGE','ATTACH','VOID','ADJUSTMENT','PIN_RESET'
                    )),
  user_id          TEXT NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_value   JSONB,
  new_value        JSONB,
  reason           TEXT
);

CREATE TRIGGER trg_audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();
-- audit_log rows are also never UPDATEd by application convention (not DB-enforced
-- beyond delete-blocking, since a hard UPDATE-block trigger here is unnecessary
-- complexity for a table the application never issues UPDATE against).

-- ================================================================
-- SYSTEM_SETTING (minimal office-wide configurable defaults — Step 9)
-- ================================================================
CREATE TABLE system_setting (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  updated_by   TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO system_setting (key, value, updated_by) VALUES
  ('default_allow_partial_payment', 'true', 'system_seed'),
  ('warn_on_missing_source', 'true', 'system_seed')
ON CONFLICT (key) DO NOTHING;

-- ================================================================
-- INDEXES — Step 12
-- ================================================================
-- Every index below is tied to a concrete query pattern established in
-- Step 5-9 (Collect/Link/Position/Trace/Exception), not speculative.
-- Search-specific indexes (Step 18) are deliberately deferred to that step.

-- matter: Client Position screen lists a client's matters, usually filtered
-- to ACTIVE. Composite covers both "all matters for client" and
-- "active matters for client" via leftmost-prefix, so no separate
-- single-column client_id index is needed.
CREATE INDEX idx_matter_client_status ON matter (client_id, status);

-- invoice: Total Invoice / Outstanding formulas (Step 7) filter
-- WHERE matter_id = X AND status IN (...) — this is that exact filter.
CREATE INDEX idx_invoice_matter_status ON invoice (matter_id, status);

-- cost_detail: Total Cost formula (Step 7) filters WHERE matter_id = X
-- AND status = 'ACTIVE'.
CREATE INDEX idx_cost_detail_matter_status ON cost_detail (matter_id, status);
-- cost_detail: Trace (Step 8) reverse-lookup "which cost items were
-- billed under this invoice" — a different access axis than matter_id,
-- and FKs are not auto-indexed by Postgres.
CREATE INDEX idx_cost_detail_invoice_id ON cost_detail (invoice_id);

-- financial_transaction: the most heavily queried table.
-- Matter Position and Client Position aggregation (Step 7) both filter
-- by their respective id + status = 'ACTIVE' in nearly every formula.
CREATE INDEX idx_txn_matter_status ON financial_transaction (matter_id, status);
CREATE INDEX idx_txn_client_status ON financial_transaction (client_id, status);
-- Partial index for the Unlinked/Review queue (Step 16) — directly serves
-- the highest-validated pain point (#5, 10/10). Only indexes the rows that
-- actually matter for this screen, not the whole table.
CREATE INDEX idx_txn_unlinked ON financial_transaction (created_at)
  WHERE client_id IS NULL AND matter_id IS NULL;
-- Partial index for the exception review queue (Step 9) — most rows will
-- be NORMAL, so indexing only the exceptions keeps this index small and fast.
CREATE INDEX idx_txn_review_required ON financial_transaction (created_at)
  WHERE review_status <> 'NORMAL';
-- Partial index for "missing source" exception (Step 9).
CREATE INDEX idx_txn_source_pending ON financial_transaction (created_at)
  WHERE source_type = 'SOURCE_PENDING';
-- General date-range filtering (reports, search) — explicitly named in
-- master prompt's priority list.
CREATE INDEX idx_txn_date ON financial_transaction (transaction_date);

-- payment_allocation: Outstanding formula (Step 7) sums allocations
-- WHERE invoice_id = X AND status = 'ACTIVE'. Unallocated Amount formula
-- sums allocations WHERE payment_id = X AND status = 'ACTIVE'. Both are
-- FK lookups Postgres does not auto-index.
CREATE INDEX idx_alloc_invoice_status ON payment_allocation (invoice_id, status);
CREATE INDEX idx_alloc_payment_status ON payment_allocation (payment_id, status);

-- financial_attachment: Document/Source section of Position screen (Step 7)
-- and Trace (Step 8) both query attachments by whichever FK is set.
-- Partial (WHERE col IS NOT NULL) since every column here is optional —
-- avoids indexing the mostly-NULL rows for each column.
CREATE INDEX idx_attach_transaction ON financial_attachment (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_attach_matter      ON financial_attachment (matter_id)      WHERE matter_id IS NOT NULL;
CREATE INDEX idx_attach_client      ON financial_attachment (client_id)      WHERE client_id IS NOT NULL;
CREATE INDEX idx_attach_cost_detail ON financial_attachment (cost_detail_id) WHERE cost_detail_id IS NOT NULL;
CREATE INDEX idx_attach_invoice     ON financial_attachment (invoice_id)     WHERE invoice_id IS NOT NULL;

-- audit_log: THE critical index for Transaction Trace (Step 8). Trace is
-- built by querying "WHERE entity_type = X AND entity_id = Y ORDER BY
-- occurred_at" repeatedly across a chain of related entities — this
-- composite index serves that exact pattern end-to-end, including the sort.
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id, occurred_at);

-- client: base index for name lookup, used by Client Position navigation
-- and as a forward-compatible building block for Search (Step 18, which
-- will decide whether a plain, prefix, or trigram index is actually needed).
CREATE INDEX idx_client_name ON client (name);
