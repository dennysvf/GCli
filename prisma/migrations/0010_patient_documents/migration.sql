-- CreateTable
CREATE TABLE "document_category" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "is_clinical" BOOLEAN NOT NULL DEFAULT false,
    "system_key" VARCHAR(30),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "is_clinical" BOOLEAN NOT NULL DEFAULT false,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "system_key" VARCHAR(30),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_document" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "category_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "is_clinical" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(12) NOT NULL DEFAULT 'READY',
    "file_name" VARCHAR(255) NOT NULL,
    "source_content_type" VARCHAR(100) NOT NULL,
    "source_object_key" VARCHAR(200) NOT NULL,
    "object_key" VARCHAR(200),
    "content_type" VARCHAR(100),
    "size_bytes" INTEGER NOT NULL,
    "stored_bytes" INTEGER NOT NULL,
    "author_user_id" UUID NOT NULL,
    "professional_id" UUID,
    "unit_id" UUID,
    "template_id" UUID,
    "template_version" INTEGER,
    "field_values" JSONB,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by_id" UUID,
    "archive_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_document_upload" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "object_key" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "declared_content_type" VARCHAR(100) NOT NULL,
    "declared_size" INTEGER NOT NULL,
    "document_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_document_upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_storage_usage" (
    "organization_id" UUID NOT NULL,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "alert_sent_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_storage_usage_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE INDEX "ix_document_category_org" ON "document_category"("organization_id", "active", "sort_order");

-- CreateIndex
CREATE INDEX "ix_document_template_org" ON "document_template"("organization_id", "active", "name");

-- CreateIndex
CREATE INDEX "ix_patient_document_list" ON "patient_document"("organization_id", "patient_id", "archived_at", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ix_patient_document_category" ON "patient_document"("organization_id", "category_id");

-- AddForeignKey
ALTER TABLE "document_category" ADD CONSTRAINT "fk_document_category_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template" ADD CONSTRAINT "fk_document_template_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_document" ADD CONSTRAINT "fk_patient_document_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_document" ADD CONSTRAINT "fk_patient_document_patient" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_document" ADD CONSTRAINT "fk_patient_document_category" FOREIGN KEY ("category_id") REFERENCES "document_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_document" ADD CONSTRAINT "fk_patient_document_template" FOREIGN KEY ("template_id") REFERENCES "document_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_document_upload" ADD CONSTRAINT "fk_patient_document_upload_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_storage_usage" ADD CONSTRAINT "fk_document_storage_usage_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- hand-written: names are unique per organization ignoring case, and each default row is created
-- once even when two requests use the feature for the first time together.
CREATE UNIQUE INDEX "uq_document_category_name" ON "document_category" ("organization_id", lower("name"));
CREATE UNIQUE INDEX "uq_document_category_system" ON "document_category" ("organization_id", "system_key")
    WHERE "system_key" IS NOT NULL;
CREATE UNIQUE INDEX "uq_document_template_name" ON "document_template" ("organization_id", lower("name"));
CREATE UNIQUE INDEX "uq_document_template_system" ON "document_template" ("organization_id", "system_key")
    WHERE "system_key" IS NOT NULL;
-- Cleanup job: intents that were never confirmed.
CREATE INDEX "ix_patient_document_upload_expiry" ON "patient_document_upload" ("expires_at")
    WHERE "document_id" IS NULL;

-- hand-written: PRD F08 limits and states.
ALTER TABLE "document_category"
    ADD CONSTRAINT "ck_document_category_name" CHECK (length(btrim("name")) BETWEEN 1 AND 60);
ALTER TABLE "document_template"
    ADD CONSTRAINT "ck_document_template_type"
        CHECK ("type" IN ('CERTIFICATE', 'ATTENDANCE_DECLARATION', 'PRESCRIPTION', 'REFERRAL', 'OTHER')),
    ADD CONSTRAINT "ck_document_template_body" CHECK (length("body_text") <= 20000);
ALTER TABLE "patient_document"
    ADD CONSTRAINT "ck_patient_document_kind" CHECK ("kind" IN ('UPLOADED', 'GENERATED')),
    ADD CONSTRAINT "ck_patient_document_status" CHECK ("status" IN ('PROCESSING', 'READY', 'FAILED')),
    ADD CONSTRAINT "ck_patient_document_title" CHECK (length(btrim("title")) BETWEEN 1 AND 200),
    ADD CONSTRAINT "ck_patient_document_size" CHECK ("size_bytes" > 0 AND "stored_bytes" >= "size_bytes"),
    -- A generated document always says which template, professional and unit produced it.
    ADD CONSTRAINT "ck_patient_document_generated" CHECK (
        "kind" = 'UPLOADED'
        OR ("template_id" IS NOT NULL AND "professional_id" IS NOT NULL AND "unit_id" IS NOT NULL)
    ),
    -- An archive always has a reason and an author.
    ADD CONSTRAINT "ck_patient_document_archive" CHECK (
        ("archived_at" IS NULL) = ("archive_reason" IS NULL)
        AND ("archived_at" IS NULL) = ("archived_by_id" IS NULL)
    );
ALTER TABLE "document_storage_usage"
    ADD CONSTRAINT "ck_document_storage_usage" CHECK ("used_bytes" >= 0);

-- hand-written: PRD F08 — a document that was clinical never becomes visible to non-clinical users
-- again, whatever the application does.
CREATE FUNCTION patient_document_keep_clinical() RETURNS trigger AS $$
BEGIN
  IF OLD."is_clinical" AND NOT NEW."is_clinical" THEN
    RAISE EXCEPTION 'DOCUMENT_CLINICAL_FLAG_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_patient_document_keep_clinical" BEFORE UPDATE OF "is_clinical" ON "patient_document"
    FOR EACH ROW EXECUTE FUNCTION patient_document_keep_clinical();

-- hand-written: documents, categories and templates are never deleted (PRD F08); archiving and
-- deactivating hide them instead.
REVOKE DELETE ON "patient_document", "document_category", "document_template" FROM gcli_app;

-- hand-written: one usage row for each existing organization; new ones are created on first use.
INSERT INTO "document_storage_usage" ("organization_id", "used_bytes", "updated_at")
SELECT o."id", 0, now() FROM "organization" o
ON CONFLICT DO NOTHING;
