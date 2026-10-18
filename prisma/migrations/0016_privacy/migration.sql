-- F14 Patient Timeline and LGPD Data Requests (spec docs/F14-patient-timeline-and-lgpd-data-requests/spec.md,
-- section 6): the request register, the exports, the anonymization marks of patients and the erased
-- state of patient documents.

-- AlterTable
ALTER TABLE "patient" ADD COLUMN "anonymized_at" TIMESTAMPTZ(6),
ADD COLUMN "anonymized_code" CHAR(6);

-- AlterTable
ALTER TABLE "patient_document" ADD COLUMN "erased_at" TIMESTAMPTZ(6),
ADD COLUMN "erased_by_id" UUID;

-- CreateTable
CREATE TABLE "lgpd_request" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "requested_by" VARCHAR(16) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "resolution" VARCHAR(2000),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lgpd_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgpd_export" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PROCESSING',
    "locale" VARCHAR(5) NOT NULL,
    "object_key" VARCHAR(200),
    "size_bytes" BIGINT,
    "file_count" INTEGER,
    "error_code" VARCHAR(30),
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "expired_at" TIMESTAMPTZ(6),

    CONSTRAINT "lgpd_export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_lgpd_request_org_status_created" ON "lgpd_request"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ix_lgpd_request_org_patient" ON "lgpd_request"("organization_id", "patient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_lgpd_export_request" ON "lgpd_export"("organization_id", "request_id", "requested_at" DESC);

-- AddForeignKey
ALTER TABLE "lgpd_request" ADD CONSTRAINT "fk_lgpd_request_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lgpd_request" ADD CONSTRAINT "fk_lgpd_request_patient" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lgpd_request" ADD CONSTRAINT "fk_lgpd_request_created_by" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lgpd_request" ADD CONSTRAINT "fk_lgpd_request_completed_by" FOREIGN KEY ("completed_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lgpd_export" ADD CONSTRAINT "fk_lgpd_export_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lgpd_export" ADD CONSTRAINT "fk_lgpd_export_request" FOREIGN KEY ("request_id") REFERENCES "lgpd_request"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lgpd_export" ADD CONSTRAINT "fk_lgpd_export_requested_by" FOREIGN KEY ("requested_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- hand-written: the request register (PRD F14). Closed vocabularies; the description is also the
-- reason of an export (10+ characters); the completion date exists exactly when the request is
-- closed; legal retention only answers anonymization requests.
ALTER TABLE "lgpd_request"
    ADD CONSTRAINT "ck_lgpd_request_type" CHECK ("type" IN ('ACCESS', 'CORRECTION', 'ANONYMIZATION')),
    ADD CONSTRAINT "ck_lgpd_request_requested_by" CHECK ("requested_by" IN ('PATIENT', 'GUARDIAN', 'REPRESENTATIVE')),
    ADD CONSTRAINT "ck_lgpd_request_status" CHECK (
        "status" IN ('PENDING', 'PROCESSING', 'FAILED', 'COMPLETED', 'LEGAL_RETENTION')),
    ADD CONSTRAINT "ck_lgpd_request_description" CHECK (char_length(btrim("description")) >= 10),
    ADD CONSTRAINT "ck_lgpd_request_resolution" CHECK (
        "resolution" IS NULL OR char_length(btrim("resolution")) >= 10),
    ADD CONSTRAINT "ck_lgpd_request_completion" CHECK (
        ("status" IN ('COMPLETED', 'LEGAL_RETENTION')) = ("completed_at" IS NOT NULL)),
    ADD CONSTRAINT "ck_lgpd_request_retention_type" CHECK ("status" <> 'LEGAL_RETENTION' OR "type" = 'ANONYMIZATION');

-- One open anonymization request per patient, whatever the application does.
CREATE UNIQUE INDEX "uq_lgpd_request_open_anonymization" ON "lgpd_request" ("organization_id", "patient_id")
    WHERE "type" = 'ANONYMIZATION' AND "status" IN ('PENDING', 'PROCESSING', 'FAILED');

-- hand-written: exports. Only a ready export has an object key, so a failed or partial file is never
-- offered; a ready export is available for exactly 7 days (PRD F14). The interval is written in hours
-- so the session time zone cannot stretch it across a daylight-saving change.
ALTER TABLE "lgpd_export"
    ADD CONSTRAINT "ck_lgpd_export_status" CHECK ("status" IN ('PROCESSING', 'READY', 'FAILED', 'EXPIRED')),
    ADD CONSTRAINT "ck_lgpd_export_ready" CHECK (("status" = 'READY') = ("object_key" IS NOT NULL)),
    ADD CONSTRAINT "ck_lgpd_export_expiry" CHECK (
        "status" <> 'READY' OR ("ready_at" IS NOT NULL AND "expires_at" = "ready_at" + interval '168 hours')),
    ADD CONSTRAINT "ck_lgpd_export_failed" CHECK (("status" = 'FAILED') = ("error_code" IS NOT NULL)),
    ADD CONSTRAINT "ck_lgpd_export_locale" CHECK ("locale" IN ('pt-BR', 'en', 'es'));

-- One build at a time per request: a double click cannot start two exports.
CREATE UNIQUE INDEX "uq_lgpd_export_processing" ON "lgpd_export" ("request_id") WHERE "status" = 'PROCESSING';
-- The daily cleanup reads the ready exports by expiry.
CREATE INDEX "ix_lgpd_export_ready_expiry" ON "lgpd_export" ("expires_at") WHERE "status" = 'READY';

-- hand-written: anonymization marks of patients (PRD F14). An anonymized patient is inactive with the
-- reason ANONYMIZED, and its placeholder code is unique in the organization.
ALTER TABLE "patient" DROP CONSTRAINT "ck_patient_inactive_reason";
ALTER TABLE "patient" ADD CONSTRAINT "ck_patient_inactive_reason" CHECK (
    "inactive_reason" IN ('DECEASED', 'MOVED', 'OTHER', 'ANONYMIZED'));
-- The mobile phone is required, except that an anonymized patient keeps an empty one.
ALTER TABLE "patient" DROP CONSTRAINT "ck_patient_mobile";
ALTER TABLE "patient" ADD CONSTRAINT "ck_patient_mobile" CHECK (
    "mobile_phone" ~ '^\+[1-9][0-9]{6,14}$' OR ("mobile_phone" = '' AND "anonymized_at" IS NOT NULL));
ALTER TABLE "patient" ADD CONSTRAINT "ck_patient_anonymized" CHECK (
    ("anonymized_at" IS NULL) = ("anonymized_code" IS NULL)
    AND ("anonymized_at" IS NULL OR (NOT "active" AND "inactive_reason" = 'ANONYMIZED'))
    AND ("anonymized_code" IS NULL OR "anonymized_code" ~ '^[0-9A-F]{6}$'));
CREATE UNIQUE INDEX "uq_patient_anonymized_code" ON "patient" ("organization_id", "anonymized_code")
    WHERE "anonymized_code" IS NOT NULL;

-- Anonymization is irreversible even if the application has a bug (as ADR-032 does for locked notes):
-- once anonymized, the identity columns and the marks themselves can never change again.
CREATE FUNCTION patient_anonymized_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."anonymized_at" IS NOT NULL AND (
       NEW."full_name", NEW."social_name", NEW."normalized_name", NEW."document_country", NEW."document_type",
       NEW."document_number", NEW."rg", NEW."mobile_phone", NEW."secondary_phone", NEW."phone_digits", NEW."email",
       NEW."address_country", NEW."postal_code", NEW."street", NEW."number", NEW."complement", NEW."district",
       NEW."city", NEW."region", NEW."occupation", NEW."referral_source_id", NEW."observations",
       NEW."guardian_name", NEW."guardian_document_type", NEW."guardian_document_number",
       NEW."guardian_relationship", NEW."guardian_phone", NEW."active", NEW."inactive_reason",
       NEW."anonymized_at", NEW."anonymized_code"
     ) IS DISTINCT FROM (
       OLD."full_name", OLD."social_name", OLD."normalized_name", OLD."document_country", OLD."document_type",
       OLD."document_number", OLD."rg", OLD."mobile_phone", OLD."secondary_phone", OLD."phone_digits", OLD."email",
       OLD."address_country", OLD."postal_code", OLD."street", OLD."number", OLD."complement", OLD."district",
       OLD."city", OLD."region", OLD."occupation", OLD."referral_source_id", OLD."observations",
       OLD."guardian_name", OLD."guardian_document_type", OLD."guardian_document_number",
       OLD."guardian_relationship", OLD."guardian_phone", OLD."active", OLD."inactive_reason",
       OLD."anonymized_at", OLD."anonymized_code"
     ) THEN
    RAISE EXCEPTION 'PATIENT_ANONYMIZED_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_patient_anonymized_immutable" BEFORE UPDATE ON "patient"
    FOR EACH ROW EXECUTE FUNCTION patient_anonymized_immutable();

-- hand-written: an erased document keeps its row (no hard delete, PRD F08) and only a non-clinical
-- upload can be erased; the erasure always says who made it.
ALTER TABLE "patient_document"
    ADD CONSTRAINT "ck_patient_document_erasable" CHECK (
        "erased_at" IS NULL OR ("kind" = 'UPLOADED' AND NOT "is_clinical")),
    ADD CONSTRAINT "ck_patient_document_erased_by" CHECK (("erased_at" IS NULL) = ("erased_by_id" IS NULL));

-- hand-written: requests and exports are records of legal obligations and are never deleted.
REVOKE DELETE ON "lgpd_request", "lgpd_export" FROM gcli_app;
