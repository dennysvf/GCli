-- CreateTable
CREATE TABLE "package_template" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "service_id" UUID NOT NULL,
    "sessions" SMALLINT NOT NULL,
    "validity_days" SMALLINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_template_price" (
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "package_template_price_pkey" PRIMARY KEY ("template_id","currency")
);

-- CreateTable
CREATE TABLE "patient_package" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "service_id" UUID NOT NULL,
    "total_sessions" SMALLINT NOT NULL,
    "used_sessions" SMALLINT NOT NULL DEFAULT 0,
    "forfeited_sessions" SMALLINT NOT NULL DEFAULT 0,
    "unit_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "sold_on" DATE NOT NULL,
    "validity_days" SMALLINT NOT NULL,
    "extended_days" SMALLINT NOT NULL DEFAULT 0,
    "expires_on" DATE NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
    "charge_id" UUID NOT NULL,
    "sold_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_id" UUID,
    "close_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_appointment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "debited_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "package_appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_movement" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "appointment_id" UUID,
    "kind" VARCHAR(10) NOT NULL,
    "sessions" SMALLINT NOT NULL,
    "days" SMALLINT,
    "reason" VARCHAR(500),
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_settings" (
    "organization_id" UUID NOT NULL,
    "debit_no_show" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,

    CONSTRAINT "package_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "package_expiration_run" (
    "organization_id" UUID NOT NULL,
    "run_on" DATE NOT NULL,
    "ran_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_expiration_run_pkey" PRIMARY KEY ("organization_id","run_on")
);

-- CreateIndex
CREATE INDEX "ix_package_template_org" ON "package_template"("organization_id", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_patient_package_charge" ON "patient_package"("charge_id");

-- CreateIndex
CREATE INDEX "ix_patient_package_patient" ON "patient_package"("organization_id", "patient_id", "status");

-- CreateIndex
CREATE INDEX "ix_package_appointment_package" ON "package_appointment"("organization_id", "package_id", "status");

-- CreateIndex
CREATE INDEX "ix_package_appointment_appointment" ON "package_appointment"("organization_id", "appointment_id");

-- CreateIndex
CREATE INDEX "ix_package_movement_package" ON "package_movement"("organization_id", "package_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "package_template" ADD CONSTRAINT "fk_package_template_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_template" ADD CONSTRAINT "fk_package_template_service" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "package_template_price" ADD CONSTRAINT "fk_package_template_price_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_template_price" ADD CONSTRAINT "fk_package_template_price_template" FOREIGN KEY ("template_id") REFERENCES "package_template"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patient_package" ADD CONSTRAINT "fk_patient_package_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_package" ADD CONSTRAINT "fk_patient_package_patient" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patient_package" ADD CONSTRAINT "fk_patient_package_template" FOREIGN KEY ("template_id") REFERENCES "package_template"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patient_package" ADD CONSTRAINT "fk_patient_package_service" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patient_package" ADD CONSTRAINT "fk_patient_package_unit" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patient_package" ADD CONSTRAINT "fk_patient_package_charge" FOREIGN KEY ("charge_id") REFERENCES "charge"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patient_package" ADD CONSTRAINT "fk_patient_package_sold_by" FOREIGN KEY ("sold_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patient_package" ADD CONSTRAINT "fk_patient_package_closed_by" FOREIGN KEY ("closed_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "package_appointment" ADD CONSTRAINT "fk_package_appointment_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_appointment" ADD CONSTRAINT "fk_package_appointment_package" FOREIGN KEY ("package_id") REFERENCES "patient_package"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "package_appointment" ADD CONSTRAINT "fk_package_appointment_appointment" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "package_movement" ADD CONSTRAINT "fk_package_movement_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_movement" ADD CONSTRAINT "fk_package_movement_package" FOREIGN KEY ("package_id") REFERENCES "patient_package"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "package_movement" ADD CONSTRAINT "fk_package_movement_appointment" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "package_movement" ADD CONSTRAINT "fk_package_movement_actor" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "package_settings" ADD CONSTRAINT "fk_package_settings_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_expiration_run" ADD CONSTRAINT "fk_package_expiration_run_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- hand-written: PRD F10 — names are unique per organization, ignoring case.
CREATE UNIQUE INDEX "uq_package_template_name" ON "package_template" ("organization_id", lower("name"));
ALTER TABLE "package_template"
    ADD CONSTRAINT "ck_package_template_name" CHECK (length(btrim("name")) BETWEEN 1 AND 80),
    ADD CONSTRAINT "ck_package_template_sessions" CHECK ("sessions" BETWEEN 2 AND 100),
    ADD CONSTRAINT "ck_package_template_validity" CHECK ("validity_days" BETWEEN 30 AND 730);
ALTER TABLE "package_template_price"
    ADD CONSTRAINT "ck_package_template_price" CHECK ("amount_minor" BETWEEN 1 AND 9999999),
    ADD CONSTRAINT "ck_package_template_price_currency" CHECK ("currency" ~ '^[A-Z]{3}$');

-- hand-written: PRD F10 — a package never uses or loses more sessions than it holds, whatever the
-- application does, and its dates follow its validity and extensions.
ALTER TABLE "patient_package"
    ADD CONSTRAINT "ck_patient_package_sessions" CHECK (
        "total_sessions" BETWEEN 2 AND 100
        AND "used_sessions" >= 0 AND "forfeited_sessions" >= 0
        AND "used_sessions" + "forfeited_sessions" <= "total_sessions"),
    ADD CONSTRAINT "ck_patient_package_extension" CHECK ("extended_days" BETWEEN 0 AND 365),
    ADD CONSTRAINT "ck_patient_package_expiry" CHECK ("expires_on" = "sold_on" + ("validity_days" - 1 + "extended_days")),
    ADD CONSTRAINT "ck_patient_package_status" CHECK (
        "status" IN ('ACTIVE', 'EXPIRED', 'CANCELLED')
        AND ("status" = 'ACTIVE') = ("closed_at" IS NULL)),
    ADD CONSTRAINT "ck_patient_package_price" CHECK ("price_minor" > 0);

-- hand-written: PRD F10 — one live link per appointment, even under concurrent edits.
CREATE UNIQUE INDEX "uq_package_appointment_live" ON "package_appointment" ("organization_id", "appointment_id")
    WHERE "status" IN ('LINKED', 'DEBITED');
ALTER TABLE "package_appointment"
    ADD CONSTRAINT "ck_package_appointment_status" CHECK (
        "status" IN ('LINKED', 'DEBITED', 'RELEASED', 'UNLINKED_EXPIRED', 'UNLINKED_CANCELLED')
        AND ("status" = 'DEBITED') = ("debited_at" IS NOT NULL));

ALTER TABLE "package_movement"
    ADD CONSTRAINT "ck_package_movement_kind" CHECK (
        "kind" IN ('SALE', 'DEBIT', 'RESTORE', 'FORFEIT', 'EXTEND', 'CANCEL') AND "sessions" >= 0);

-- hand-written: the ledger is append-only; packages, links and templates are never deleted.
REVOKE UPDATE, DELETE ON "package_movement" FROM gcli_app;
REVOKE DELETE ON "patient_package", "package_appointment", "package_template" FROM gcli_app;
