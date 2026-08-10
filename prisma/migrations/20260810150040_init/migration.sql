-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "client_type" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "contact_address" TEXT,
    "identity_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "matter_name" TEXT NOT NULL,
    "matter_type" TEXT,
    "service" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "responsible_staff" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "matter_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "allow_partial_payment" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_detail" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "matter_id" UUID NOT NULL,
    "invoice_id" UUID,
    "cost_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
    "source_reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "financial_type" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "client_id" UUID,
    "matter_id" UUID,
    "source_type" TEXT NOT NULL DEFAULT 'SOURCE_PENDING',
    "source_reference" TEXT,
    "review_status" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,
    "void_reason" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "financial_transaction_id" UUID NOT NULL,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "financial_transaction_id" UUID NOT NULL,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "financial_transaction_id" UUID NOT NULL,
    "category" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID,
    "allocation_type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversed_at" TIMESTAMP(3),
    "reversed_by" TEXT,
    "reversal_reason" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_attachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT,
    "client_id" UUID,
    "matter_id" UUID,
    "transaction_id" UUID,
    "cost_detail_id" UUID,
    "invoice_id" UUID,
    "uploaded_by" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "matter_client_id_status_idx" ON "matter"("client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_invoice_number_key" ON "invoice"("invoice_number");

-- CreateIndex
CREATE INDEX "invoice_matter_id_status_idx" ON "invoice"("matter_id", "status");

-- CreateIndex
CREATE INDEX "cost_detail_matter_id_status_idx" ON "cost_detail"("matter_id", "status");

-- CreateIndex
CREATE INDEX "cost_detail_invoice_id_idx" ON "cost_detail"("invoice_id");

-- CreateIndex
CREATE INDEX "financial_transaction_matter_id_status_idx" ON "financial_transaction"("matter_id", "status");

-- CreateIndex
CREATE INDEX "financial_transaction_client_id_status_idx" ON "financial_transaction"("client_id", "status");

-- CreateIndex
CREATE INDEX "financial_transaction_transaction_date_idx" ON "financial_transaction"("transaction_date");

-- CreateIndex
CREATE UNIQUE INDEX "payment_financial_transaction_id_key" ON "payment"("financial_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_financial_transaction_id_key" ON "deposit"("financial_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_financial_transaction_id_key" ON "disbursement"("financial_transaction_id");

-- CreateIndex
CREATE INDEX "payment_allocation_invoice_id_status_idx" ON "payment_allocation"("invoice_id", "status");

-- CreateIndex
CREATE INDEX "payment_allocation_payment_id_status_idx" ON "payment_allocation"("payment_id", "status");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_occurred_at_idx" ON "audit_log"("entity_type", "entity_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "matter" ADD CONSTRAINT "matter_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_detail" ADD CONSTRAINT "cost_detail_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_detail" ADD CONSTRAINT "cost_detail_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_financial_transaction_id_fkey" FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit" ADD CONSTRAINT "deposit_financial_transaction_id_fkey" FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursement" ADD CONSTRAINT "disbursement_financial_transaction_id_fkey" FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_cost_detail_id_fkey" FOREIGN KEY ("cost_detail_id") REFERENCES "cost_detail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "financial_attachment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
