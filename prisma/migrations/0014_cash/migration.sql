-- CreateTable
CREATE TABLE "financial_category" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "opening_minor" BIGINT NOT NULL,
    "suggested_opening_minor" BIGINT NOT NULL,
    "opening_reason" VARCHAR(500),
    "status" VARCHAR(6) NOT NULL DEFAULT 'OPEN',
    "flagged_unclosed" BOOLEAN NOT NULL DEFAULT false,
    "flagged_at" TIMESTAMPTZ(6),
    "opened_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cash_register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register_closing" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "sequence" SMALLINT NOT NULL,
    "expected_minor" BIGINT NOT NULL,
    "counted_minor" BIGINT NOT NULL,
    "difference_minor" BIGINT NOT NULL,
    "justification" VARCHAR(500),
    "by_method" JSONB NOT NULL,
    "movements_in_minor" BIGINT NOT NULL,
    "movements_out_minor" BIGINT NOT NULL,
    "was_flagged_unclosed" BOOLEAN NOT NULL,
    "closed_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_register_closing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register_reopening" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "closing_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "reopened_by_id" UUID NOT NULL,
    "reopened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_register_reopening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movement" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "category_id" UUID NOT NULL,
    "attachment_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_at" TIMESTAMPTZ(6),
    "reversed_by_id" UUID,
    "reversal_reason" VARCHAR(500),

    CONSTRAINT "cash_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_attachment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "object_key" VARCHAR(300) NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(50) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'PENDING',
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entry_series" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(7) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "category_id" UUID NOT NULL,
    "unit_id" UUID,
    "currency" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "day_of_month" SMALLINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ended_at" TIMESTAMPTZ(6),
    "ended_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_entry_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entry" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(7) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "category_id" UUID NOT NULL,
    "unit_id" UUID,
    "currency" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "due_date" DATE NOT NULL,
    "status" VARCHAR(7) NOT NULL DEFAULT 'PENDING',
    "series_id" UUID,
    "occurrence_index" SMALLINT,
    "attachment_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "financial_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entry_payment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_at" TIMESTAMPTZ(6),
    "reversed_by_id" UUID,
    "reversal_reason" VARCHAR(500),

    CONSTRAINT "financial_entry_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_cash_register_open" ON "cash_register"("organization_id", "status", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cash_register_unit_day" ON "cash_register"("organization_id", "unit_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cash_closing_sequence" ON "cash_register_closing"("register_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cash_reopening_closing" ON "cash_register_reopening"("closing_id");

-- CreateIndex
CREATE INDEX "ix_cash_reopening_register" ON "cash_register_reopening"("organization_id", "register_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cash_movement_attachment" ON "cash_movement"("attachment_id");

-- CreateIndex
CREATE INDEX "ix_cash_movement_register" ON "cash_movement"("organization_id", "register_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_financial_attachment_key" ON "financial_attachment"("object_key");

-- CreateIndex
CREATE INDEX "ix_financial_attachment_pending" ON "financial_attachment"("status", "created_at");

-- CreateIndex
CREATE INDEX "ix_financial_series_active" ON "financial_entry_series"("organization_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_financial_entry_attachment" ON "financial_entry"("attachment_id");

-- CreateIndex
CREATE INDEX "ix_financial_entry_due" ON "financial_entry"("organization_id", "kind", "due_date");

-- CreateIndex
CREATE INDEX "ix_financial_entry_unit" ON "financial_entry"("organization_id", "unit_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_financial_entry_occurrence" ON "financial_entry"("series_id", "occurrence_index");

-- CreateIndex
CREATE INDEX "ix_financial_payment_paid_on" ON "financial_entry_payment"("organization_id", "paid_on");

-- AddForeignKey
ALTER TABLE "financial_category" ADD CONSTRAINT "fk_financial_category_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register" ADD CONSTRAINT "fk_cash_register_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register" ADD CONSTRAINT "fk_cash_register_unit" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_register" ADD CONSTRAINT "fk_cash_register_opened_by" FOREIGN KEY ("opened_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_register_closing" ADD CONSTRAINT "fk_cash_closing_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_closing" ADD CONSTRAINT "fk_cash_closing_register" FOREIGN KEY ("register_id") REFERENCES "cash_register"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_register_closing" ADD CONSTRAINT "fk_cash_closing_user" FOREIGN KEY ("closed_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_register_reopening" ADD CONSTRAINT "fk_cash_reopening_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_reopening" ADD CONSTRAINT "fk_cash_reopening_register" FOREIGN KEY ("register_id") REFERENCES "cash_register"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_register_reopening" ADD CONSTRAINT "fk_cash_reopening_closing" FOREIGN KEY ("closing_id") REFERENCES "cash_register_closing"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_register_reopening" ADD CONSTRAINT "fk_cash_reopening_user" FOREIGN KEY ("reopened_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "fk_cash_movement_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "fk_cash_movement_register" FOREIGN KEY ("register_id") REFERENCES "cash_register"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "fk_cash_movement_category" FOREIGN KEY ("category_id") REFERENCES "financial_category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "fk_cash_movement_attachment" FOREIGN KEY ("attachment_id") REFERENCES "financial_attachment"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "fk_cash_movement_created_by" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "fk_cash_movement_reversed_by" FOREIGN KEY ("reversed_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "fk_financial_attachment_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachment" ADD CONSTRAINT "fk_financial_attachment_user" FOREIGN KEY ("uploaded_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry_series" ADD CONSTRAINT "fk_financial_series_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entry_series" ADD CONSTRAINT "fk_financial_series_category" FOREIGN KEY ("category_id") REFERENCES "financial_category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry_series" ADD CONSTRAINT "fk_financial_series_unit" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry_series" ADD CONSTRAINT "fk_financial_series_created_by" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry_series" ADD CONSTRAINT "fk_financial_series_ended_by" FOREIGN KEY ("ended_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "fk_financial_entry_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "fk_financial_entry_category" FOREIGN KEY ("category_id") REFERENCES "financial_category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "fk_financial_entry_unit" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "fk_financial_entry_series" FOREIGN KEY ("series_id") REFERENCES "financial_entry_series"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "fk_financial_entry_attachment" FOREIGN KEY ("attachment_id") REFERENCES "financial_attachment"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "fk_financial_entry_created_by" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "fk_financial_entry_deleted_by" FOREIGN KEY ("deleted_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry_payment" ADD CONSTRAINT "fk_financial_payment_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entry_payment" ADD CONSTRAINT "fk_financial_payment_entry" FOREIGN KEY ("entry_id") REFERENCES "financial_entry"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry_payment" ADD CONSTRAINT "fk_financial_payment_recorded_by" FOREIGN KEY ("recorded_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "financial_entry_payment" ADD CONSTRAINT "fk_financial_payment_reversed_by" FOREIGN KEY ("reversed_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- hand-written: category names are unique per kind ignoring case; one system category per kind
CREATE UNIQUE INDEX "uq_financial_category_name" ON "financial_category" ("organization_id", "kind", lower("name"));
CREATE UNIQUE INDEX "uq_financial_category_system" ON "financial_category" ("organization_id", "kind") WHERE "system";
ALTER TABLE "financial_category"
    ADD CONSTRAINT "ck_financial_category_kind" CHECK ("kind" IN ('EXPENSE', 'REVENUE', 'TRANSFER')),
    ADD CONSTRAINT "ck_financial_category_name" CHECK (length(btrim("name")) BETWEEN 1 AND 60);

-- hand-written: the cash register (PRD F11)
ALTER TABLE "cash_register"
    ADD CONSTRAINT "ck_cash_register_status" CHECK ("status" IN ('OPEN', 'CLOSED')),
    ADD CONSTRAINT "ck_cash_register_opening" CHECK ("opening_minor" >= 0 AND "suggested_opening_minor" >= 0),
    ADD CONSTRAINT "ck_cash_register_opening_reason" CHECK (
        "opening_minor" = "suggested_opening_minor"
        OR ("opening_reason" IS NOT NULL AND length(btrim("opening_reason")) >= 10)),
    ADD CONSTRAINT "ck_cash_register_currency" CHECK ("currency" ~ '^[A-Z]{3}$');

-- a closing is immutable; a difference needs a justification of at least 10 characters
ALTER TABLE "cash_register_closing"
    ADD CONSTRAINT "ck_cash_closing_counted" CHECK ("counted_minor" >= 0 AND "sequence" >= 1),
    ADD CONSTRAINT "ck_cash_closing_difference" CHECK ("difference_minor" = "counted_minor" - "expected_minor"),
    ADD CONSTRAINT "ck_cash_closing_justification" CHECK (
        "difference_minor" = 0 OR ("justification" IS NOT NULL AND length(btrim("justification")) >= 10));
ALTER TABLE "cash_register_reopening"
    ADD CONSTRAINT "ck_cash_reopening_reason" CHECK (length(btrim("reason")) >= 10);

-- manual movements are reversed, never edited or deleted
ALTER TABLE "cash_movement"
    ADD CONSTRAINT "ck_cash_movement_direction" CHECK ("direction" IN ('IN', 'OUT')),
    ADD CONSTRAINT "ck_cash_movement_amount" CHECK ("amount_minor" BETWEEN 1 AND 999999999),
    ADD CONSTRAINT "ck_cash_movement_description" CHECK (length(btrim("description")) >= 3),
    ADD CONSTRAINT "ck_cash_movement_reversal" CHECK (
        ("reversed_at" IS NULL AND "reversed_by_id" IS NULL AND "reversal_reason" IS NULL)
        OR ("reversed_at" IS NOT NULL AND "reversed_by_id" IS NOT NULL
            AND "reversal_reason" IS NOT NULL AND length(btrim("reversal_reason")) >= 10));

ALTER TABLE "financial_attachment"
    ADD CONSTRAINT "ck_financial_attachment_type" CHECK ("content_type" IN ('application/pdf', 'image/jpeg', 'image/png')),
    ADD CONSTRAINT "ck_financial_attachment_size" CHECK ("size_bytes" BETWEEN 1 AND 10485760),
    ADD CONSTRAINT "ck_financial_attachment_status" CHECK ("status" IN ('PENDING', 'ATTACHED'));

ALTER TABLE "financial_entry_series"
    ADD CONSTRAINT "ck_financial_series_kind" CHECK ("kind" IN ('EXPENSE', 'REVENUE')),
    ADD CONSTRAINT "ck_financial_series_day" CHECK ("day_of_month" BETWEEN 1 AND 31),
    ADD CONSTRAINT "ck_financial_series_amount" CHECK ("amount_minor" BETWEEN 1 AND 999999999);

-- only a pending entry can be deleted (soft delete)
ALTER TABLE "financial_entry"
    ADD CONSTRAINT "ck_financial_entry_kind" CHECK ("kind" IN ('EXPENSE', 'REVENUE')),
    ADD CONSTRAINT "ck_financial_entry_status" CHECK ("status" IN ('PENDING', 'PAID')),
    ADD CONSTRAINT "ck_financial_entry_description" CHECK (length(btrim("description")) >= 3),
    ADD CONSTRAINT "ck_financial_entry_amount" CHECK ("amount_minor" BETWEEN 1 AND 999999999),
    ADD CONSTRAINT "ck_financial_entry_deleted" CHECK ("deleted_at" IS NULL OR "status" = 'PENDING');

-- one live payment per entry; a reversal keeps the row
CREATE UNIQUE INDEX "uq_financial_entry_payment_live" ON "financial_entry_payment" ("entry_id") WHERE "reversed_at" IS NULL;
ALTER TABLE "financial_entry_payment"
    ADD CONSTRAINT "ck_financial_payment_amount" CHECK ("amount_minor" > 0),
    ADD CONSTRAINT "ck_financial_payment_reversal" CHECK (
        ("reversed_at" IS NULL AND "reversed_by_id" IS NULL AND "reversal_reason" IS NULL)
        OR ("reversed_at" IS NOT NULL AND "reversed_by_id" IS NOT NULL
            AND "reversal_reason" IS NOT NULL AND length(btrim("reversal_reason")) >= 10));

-- history is never rewritten: closings and reopenings are immutable, nothing is deleted
REVOKE UPDATE, DELETE ON "cash_register_closing", "cash_register_reopening" FROM gcli_app;
REVOKE DELETE ON "cash_register", "cash_movement", "financial_entry", "financial_entry_payment",
    "financial_entry_series", "financial_category" FROM gcli_app;
