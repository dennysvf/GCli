-- CreateTable
CREATE TABLE "appointment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "room_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" SMALLINT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'SCHEDULED',
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_overbooking" BOOLEAN NOT NULL DEFAULT false,
    "exception_justification" VARCHAR(500),
    "exception_codes" VARCHAR(40)[],
    "notes" VARCHAR(500),
    "series_id" UUID,
    "series_index" SMALLINT,
    "cancellation_origin" VARCHAR(12),
    "cancellation_reason_id" UUID,
    "cancellation_note" VARCHAR(500),
    "cancelled_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_status_change" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "from_status" VARCHAR(12),
    "to_status" VARCHAR(12) NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" UUID NOT NULL,
    "justification" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_reschedule" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "previous_starts_at" TIMESTAMPTZ(6) NOT NULL,
    "previous_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "previous_professional_id" UUID NOT NULL,
    "previous_room_id" UUID,
    "previous_status" VARCHAR(12) NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "rescheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rescheduled_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_reschedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_series" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "room_id" UUID,
    "frequency" VARCHAR(10) NOT NULL,
    "weekdays" SMALLINT[],
    "start_minute" SMALLINT NOT NULL,
    "duration_minutes" SMALLINT NOT NULL,
    "first_date" DATE NOT NULL,
    "ends_on" DATE,
    "occurrence_count" SMALLINT,
    "ends_after_index" SMALLINT,
    "previous_series_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_reason" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancellation_reason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_appointment_org_unit_start" ON "appointment"("organization_id", "unit_id", "starts_at");

-- CreateIndex
CREATE INDEX "ix_appointment_org_professional_start" ON "appointment"("organization_id", "professional_id", "starts_at");

-- CreateIndex
CREATE INDEX "ix_appointment_org_patient_start" ON "appointment"("organization_id", "patient_id", "starts_at" DESC);

-- CreateIndex
CREATE INDEX "ix_appointment_org_service_start" ON "appointment"("organization_id", "service_id", "starts_at");

-- CreateIndex
CREATE INDEX "ix_appointment_org_updated" ON "appointment"("organization_id", "updated_at");

-- CreateIndex
CREATE INDEX "ix_appointment_org_room_start" ON "appointment"("organization_id", "room_id", "starts_at");

-- CreateIndex
CREATE INDEX "ix_status_change_appointment" ON "appointment_status_change"("appointment_id", "changed_at");

-- CreateIndex
CREATE INDEX "ix_reschedule_appointment" ON "appointment_reschedule"("appointment_id", "rescheduled_at");

-- CreateIndex
CREATE INDEX "ix_series_org_patient" ON "appointment_series"("organization_id", "patient_id");

-- CreateIndex
CREATE INDEX "ix_cancellation_reason_org_active" ON "cancellation_reason"("organization_id", "active", "sort_order");

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "fk_appointment_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "fk_appointment_unit" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "fk_appointment_professional" FOREIGN KEY ("professional_id") REFERENCES "professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "fk_appointment_service" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "fk_appointment_patient" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "fk_appointment_room" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "fk_appointment_series" FOREIGN KEY ("series_id") REFERENCES "appointment_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "fk_appointment_cancellation_reason" FOREIGN KEY ("cancellation_reason_id") REFERENCES "cancellation_reason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_status_change" ADD CONSTRAINT "fk_status_change_appointment" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reschedule" ADD CONSTRAINT "fk_reschedule_appointment" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series" ADD CONSTRAINT "fk_series_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series" ADD CONSTRAINT "fk_series_previous" FOREIGN KEY ("previous_series_id") REFERENCES "appointment_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_reason" ADD CONSTRAINT "fk_cancellation_reason_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- hand-written: no double booking under concurrency (PRD F06, ADR-026). btree_gist was created in
-- 0005_professionals. Cancelled and no-show appointments free the slot; an Encaixe is excluded
-- from the professional constraint only, never from the room constraint.
ALTER TABLE "appointment" ADD CONSTRAINT "ex_appointment_professional"
  EXCLUDE USING gist ("professional_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW') AND NOT "is_overbooking");
ALTER TABLE "appointment" ADD CONSTRAINT "ex_appointment_room"
  EXCLUDE USING gist ("room_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("room_id" IS NOT NULL AND "status" NOT IN ('CANCELLED', 'NO_SHOW'));

-- hand-written: occurrences of a series in order
CREATE INDEX "ix_appointment_series" ON "appointment" ("series_id", "series_index") WHERE "series_id" IS NOT NULL;

-- hand-written: case-insensitive unique cancellation reasons
CREATE UNIQUE INDEX "uq_cancellation_reason_org_name" ON "cancellation_reason" ("organization_id", lower("name"));

-- hand-written: value constraints (PRD F06 capabilities)
ALTER TABLE "appointment" ADD CONSTRAINT "ck_appointment_status" CHECK (
  "status" IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'));
ALTER TABLE "appointment" ADD CONSTRAINT "ck_appointment_duration" CHECK (
  "duration_minutes" BETWEEN 5 AND 480 AND "duration_minutes" % 5 = 0);
ALTER TABLE "appointment" ADD CONSTRAINT "ck_appointment_end" CHECK (
  "ends_at" = "starts_at" + make_interval(mins => "duration_minutes"));
ALTER TABLE "appointment" ADD CONSTRAINT "ck_appointment_price" CHECK ("price_cents" >= 0);
ALTER TABLE "appointment" ADD CONSTRAINT "ck_appointment_origin" CHECK (
  "cancellation_origin" IN ('PATIENT', 'CLINIC', 'PROFESSIONAL'));
ALTER TABLE "appointment" ADD CONSTRAINT "ck_appointment_cancellation" CHECK (
  ("status" = 'CANCELLED') = ("cancellation_origin" IS NOT NULL AND "cancellation_reason_id" IS NOT NULL
    AND "cancelled_at" IS NOT NULL));
ALTER TABLE "appointment" ADD CONSTRAINT "ck_appointment_series" CHECK (("series_id" IS NULL) = ("series_index" IS NULL));
ALTER TABLE "appointment" ADD CONSTRAINT "ck_appointment_exception" CHECK (
  "exception_justification" IS NULL OR char_length("exception_justification") >= 10);
ALTER TABLE "appointment_status_change" ADD CONSTRAINT "ck_status_change_to" CHECK (
  "to_status" IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'));
ALTER TABLE "appointment_reschedule" ADD CONSTRAINT "ck_reschedule_source" CHECK ("source" IN ('FORM', 'DRAG', 'SERIES'));
ALTER TABLE "appointment_series" ADD CONSTRAINT "ck_series_frequency" CHECK ("frequency" IN ('WEEKLY', 'BIWEEKLY'));
ALTER TABLE "appointment_series" ADD CONSTRAINT "ck_series_weekdays" CHECK (
  "weekdays" IS NOT NULL AND cardinality("weekdays") BETWEEN 1 AND 6 AND "weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]);
ALTER TABLE "appointment_series" ADD CONSTRAINT "ck_series_end" CHECK (("ends_on" IS NULL) <> ("occurrence_count" IS NULL));
ALTER TABLE "appointment_series" ADD CONSTRAINT "ck_series_count" CHECK ("occurrence_count" BETWEEN 2 AND 52);
ALTER TABLE "appointment_series" ADD CONSTRAINT "ck_series_start" CHECK ("start_minute" BETWEEN 0 AND 1435);

-- hand-written: status and reschedule history is evidence of who changed what; the runtime role
-- may only append and read.
REVOKE ALL ON "appointment_status_change", "appointment_reschedule" FROM gcli_app;
GRANT SELECT, INSERT ON "appointment_status_change", "appointment_reschedule" TO gcli_app;
