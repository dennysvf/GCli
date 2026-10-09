-- CreateTable
CREATE TABLE "charge" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" VARCHAR(12) NOT NULL,
    "patient_id" UUID NOT NULL,
    "origin" VARCHAR(12) NOT NULL,
    "appointment_id" UUID,
    "package_id" UUID,
    "service_id" UUID,
    "description" VARCHAR(200),
    "professional_id" UUID,
    "unit_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "gross_minor" BIGINT NOT NULL,
    "discount_kind" VARCHAR(8),
    "discount_value" INTEGER,
    "discount_minor" BIGINT NOT NULL DEFAULT 0,
    "discount_reason" VARCHAR(500),
    "net_minor" BIGINT NOT NULL,
    "paid_minor" BIGINT NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "refunded_payment_id" UUID,
    "submission_id" UUID,
    "method" VARCHAR(20) NOT NULL,
    "installments" SMALLINT,
    "amount_minor" BIGINT NOT NULL,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "unit_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,
    "reason" VARCHAR(500),

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_submission" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_submission_pkey" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "charge_discount_request" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "value" INTEGER NOT NULL,
    "discount_minor" BIGINT NOT NULL,
    "reason" VARCHAR(500),
    "status" VARCHAR(10) NOT NULL,
    "method" VARCHAR(8),
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "rejection_reason" VARCHAR(500),

    CONSTRAINT "charge_discount_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_number_sequence" (
    "organization_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "charge_number_sequence_pkey" PRIMARY KEY ("organization_id","year")
);

-- CreateTable
CREATE TABLE "disabled_payment_method" (
    "organization_id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "disabled_by_id" UUID NOT NULL,
    "disabled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disabled_payment_method_pkey" PRIMARY KEY ("organization_id","country","method")
);

-- CreateIndex
CREATE INDEX "ix_charge_list" ON "charge"("organization_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ix_charge_unit_status" ON "charge"("organization_id", "unit_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ix_charge_patient" ON "charge"("organization_id", "patient_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_charge_currency" ON "charge"("organization_id", "id", "currency");

-- CreateIndex
CREATE INDEX "ix_payment_charge" ON "payment"("organization_id", "charge_id", "received_at");

-- CreateIndex
CREATE INDEX "ix_payment_unit_received" ON "payment"("organization_id", "unit_id", "received_at");

-- CreateIndex
CREATE INDEX "ix_payment_method" ON "payment"("organization_id", "method", "charge_id");

-- CreateIndex
CREATE INDEX "ix_payment_submission_charge" ON "payment_submission"("organization_id", "charge_id");

-- CreateIndex
CREATE INDEX "ix_discount_request_charge" ON "charge_discount_request"("organization_id", "charge_id", "requested_at");

-- AddForeignKey
ALTER TABLE "charge" ADD CONSTRAINT "fk_charge_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "fk_payment_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "fk_payment_charge_currency" FOREIGN KEY ("organization_id", "charge_id", "currency") REFERENCES "charge"("organization_id", "id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "fk_payment_refunded" FOREIGN KEY ("refunded_payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submission" ADD CONSTRAINT "fk_payment_submission_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submission" ADD CONSTRAINT "fk_payment_submission_charge" FOREIGN KEY ("charge_id") REFERENCES "charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_discount_request" ADD CONSTRAINT "fk_discount_request_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_discount_request" ADD CONSTRAINT "fk_discount_request_charge" FOREIGN KEY ("charge_id") REFERENCES "charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_number_sequence" ADD CONSTRAINT "fk_charge_number_sequence_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disabled_payment_method" ADD CONSTRAINT "fk_disabled_payment_method_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- hand-written: foreign keys to tables the Prisma schema does not relate (patient, appointment,
-- service, professional, unit, user).
ALTER TABLE "charge"
    ADD CONSTRAINT "fk_charge_patient" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT,
    ADD CONSTRAINT "fk_charge_appointment" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE RESTRICT,
    ADD CONSTRAINT "fk_charge_service" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT,
    ADD CONSTRAINT "fk_charge_professional" FOREIGN KEY ("professional_id") REFERENCES "professional"("id") ON DELETE RESTRICT,
    ADD CONSTRAINT "fk_charge_unit" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT,
    ADD CONSTRAINT "fk_charge_created_by" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT,
    ADD CONSTRAINT "fk_charge_cancelled_by" FOREIGN KEY ("cancelled_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT;
ALTER TABLE "payment"
    ADD CONSTRAINT "fk_payment_unit" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT,
    ADD CONSTRAINT "fk_payment_user" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT,
    ADD CONSTRAINT "fk_payment_submission" FOREIGN KEY ("organization_id", "submission_id")
        REFERENCES "payment_submission"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "payment_submission"
    ADD CONSTRAINT "fk_payment_submission_user" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT;
ALTER TABLE "charge_discount_request"
    ADD CONSTRAINT "fk_discount_request_requested_by" FOREIGN KEY ("requested_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT,
    ADD CONSTRAINT "fk_discount_request_decided_by" FOREIGN KEY ("decided_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT;
ALTER TABLE "disabled_payment_method"
    ADD CONSTRAINT "fk_disabled_payment_method_user" FOREIGN KEY ("disabled_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT;

-- hand-written: PRD F09 — one live charge per appointment, even under concurrent check-ins; an
-- undone check-in deletes its charge, a void keeps the row, so cancelled charges do not count.
CREATE UNIQUE INDEX "uq_charge_live_appointment" ON "charge" ("organization_id", "appointment_id")
    WHERE "appointment_id" IS NOT NULL AND "status" <> 'CANCELLED';
CREATE UNIQUE INDEX "uq_charge_number" ON "charge" ("organization_id", "number");
CREATE INDEX "ix_charge_pending" ON "charge" ("organization_id", "created_at") WHERE "status" = 'PENDING_APPROVAL';

-- hand-written: PRD F09 — overpayment is impossible whatever the application does, and the
-- amounts of a charge always add up.
ALTER TABLE "charge"
    ADD CONSTRAINT "ck_charge_amounts" CHECK (
        "gross_minor" > 0 AND "discount_minor" BETWEEN 0 AND "gross_minor"
        AND "net_minor" = "gross_minor" - "discount_minor"
        AND "paid_minor" BETWEEN 0 AND "net_minor"),
    ADD CONSTRAINT "ck_charge_origin" CHECK (
        ("origin" = 'APPOINTMENT') = ("appointment_id" IS NOT NULL)
        AND ("origin" = 'PACKAGE') = ("package_id" IS NOT NULL)
        AND "origin" IN ('APPOINTMENT', 'MANUAL', 'PACKAGE')),
    ADD CONSTRAINT "ck_charge_item" CHECK ("service_id" IS NOT NULL OR "description" IS NOT NULL),
    ADD CONSTRAINT "ck_charge_status" CHECK (
        "status" IN ('PENDING_APPROVAL', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')
        AND ("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)
        AND ("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)
        AND ("cancelled_at" IS NULL) = ("cancelled_by_id" IS NULL)),
    ADD CONSTRAINT "ck_charge_discount" CHECK (
        ("discount_kind" IS NULL) = ("discount_value" IS NULL)
        AND ("discount_kind" IS NULL OR "discount_kind" IN ('PERCENT', 'AMOUNT'))),
    ADD CONSTRAINT "ck_charge_currency" CHECK ("currency" ~ '^[A-Z]{3}$');

-- hand-written: payments and refunds. A refund is a negative row that points to the payment it
-- returns; a payment carries the idempotent submission that created it.
ALTER TABLE "payment"
    ADD CONSTRAINT "ck_payment_kind" CHECK (
        ("kind" = 'PAYMENT' AND "amount_minor" > 0 AND "refunded_payment_id" IS NULL
            AND "submission_id" IS NOT NULL AND "reason" IS NULL AND "refunded_minor" BETWEEN 0 AND "amount_minor")
        OR ("kind" = 'REFUND' AND "amount_minor" < 0 AND "refunded_payment_id" IS NOT NULL
            AND "reason" IS NOT NULL AND "refunded_minor" = 0)),
    ADD CONSTRAINT "ck_payment_installments" CHECK (
        ("method" = 'CREDIT_CARD' AND "kind" = 'PAYMENT') = ("installments" IS NOT NULL)
        AND ("installments" IS NULL OR "installments" BETWEEN 1 AND 12));

-- hand-written: a submission key is processed once per organization (primary key) and one charge
-- has at most one pending discount request.
CREATE UNIQUE INDEX "uq_discount_request_pending" ON "charge_discount_request" ("organization_id", "charge_id")
    WHERE "status" = 'PENDING';
ALTER TABLE "charge_discount_request"
    ADD CONSTRAINT "ck_discount_request" CHECK (
        "status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')
        AND "kind" IN ('PERCENT', 'AMOUNT')
        AND ("method" IS NULL OR "method" IN ('ROLE', 'PIN', 'LIST'))
        AND ("status" <> 'APPROVED' OR ("method" IS NOT NULL AND "decided_by_id" IS NOT NULL AND "decided_at" IS NOT NULL))
        AND ("status" <> 'REJECTED' OR ("rejection_reason" IS NOT NULL AND "decided_by_id" IS NOT NULL AND "decided_at" IS NOT NULL))),
    ADD CONSTRAINT "ck_discount_request_amount" CHECK ("discount_minor" > 0);
ALTER TABLE "charge_number_sequence" ADD CONSTRAINT "ck_charge_number_sequence" CHECK ("last_value" > 0);

-- hand-written: payments, submissions and discount decisions are never deleted. A charge may be
-- deleted only by the check-in undo, and the RESTRICT foreign key refuses it once a payment exists.
REVOKE DELETE ON "payment", "payment_submission", "charge_discount_request" FROM gcli_app;
