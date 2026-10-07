-- CreateTable
CREATE TABLE "clinical_note" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "appointment_id" UUID,
    "kind" VARCHAR(12) NOT NULL,
    "professional_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "content_html" TEXT NOT NULL,
    "content_text" TEXT NOT NULL,
    "characters" INTEGER NOT NULL,
    "draft_saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locks_at" TIMESTAMPTZ(6) NOT NULL,
    "finalized_at" TIMESTAMPTZ(6),
    "finalized_by_id" UUID,
    "auto_finalized" BOOLEAN NOT NULL DEFAULT false,
    "edit_draft_html" TEXT,
    "edit_draft_text" TEXT,
    "edit_draft_characters" INTEGER,
    "edit_started_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_note_version" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "version_number" SMALLINT NOT NULL,
    "content_html" TEXT NOT NULL,
    "content_text" TEXT NOT NULL,
    "characters" INTEGER NOT NULL,
    "replaced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaced_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_note_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_note_addendum" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "content_html" TEXT NOT NULL,
    "content_text" TEXT NOT NULL,
    "characters" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_note_addendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_attachment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "source_content_type" VARCHAR(20) NOT NULL,
    "source_object_key" VARCHAR(200) NOT NULL,
    "object_key" VARCHAR(200),
    "content_type" VARCHAR(20),
    "thumbnail_key" VARCHAR(200),
    "size_bytes" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "marked_in_error_at" TIMESTAMPTZ(6),
    "marked_in_error_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_attachment_upload" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "object_key" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "declared_content_type" VARCHAR(20) NOT NULL,
    "declared_size" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "attachment_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_attachment_upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_alert" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_alert_change" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "previous_text" VARCHAR(500) NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_alert_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_clinical_note_org_patient_created" ON "clinical_note"("organization_id", "patient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_clinical_note_org_professional" ON "clinical_note"("organization_id", "professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_clinical_version_note_number" ON "clinical_note_version"("note_id", "version_number");

-- CreateIndex
CREATE INDEX "ix_clinical_addendum_note" ON "clinical_note_addendum"("note_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_clinical_attachment_note" ON "clinical_attachment"("note_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_clinical_alert_org_patient" ON "clinical_alert"("organization_id", "patient_id");

-- CreateIndex
CREATE INDEX "ix_clinical_alert_change_alert" ON "clinical_alert_change"("alert_id", "created_at");

-- AddForeignKey
ALTER TABLE "clinical_note" ADD CONSTRAINT "fk_clinical_note_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note" ADD CONSTRAINT "fk_clinical_note_patient" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note" ADD CONSTRAINT "fk_clinical_note_appointment" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note" ADD CONSTRAINT "fk_clinical_note_professional" FOREIGN KEY ("professional_id") REFERENCES "professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_version" ADD CONSTRAINT "fk_clinical_version_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_version" ADD CONSTRAINT "fk_clinical_version_note" FOREIGN KEY ("note_id") REFERENCES "clinical_note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_addendum" ADD CONSTRAINT "fk_clinical_addendum_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_addendum" ADD CONSTRAINT "fk_clinical_addendum_note" FOREIGN KEY ("note_id") REFERENCES "clinical_note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attachment" ADD CONSTRAINT "fk_clinical_attachment_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attachment" ADD CONSTRAINT "fk_clinical_attachment_note" FOREIGN KEY ("note_id") REFERENCES "clinical_note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attachment_upload" ADD CONSTRAINT "fk_clinical_upload_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_attachment_upload" ADD CONSTRAINT "fk_clinical_upload_note" FOREIGN KEY ("note_id") REFERENCES "clinical_note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_alert" ADD CONSTRAINT "fk_clinical_alert_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_alert" ADD CONSTRAINT "fk_clinical_alert_patient" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_alert_change" ADD CONSTRAINT "fk_clinical_alert_change_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_alert_change" ADD CONSTRAINT "fk_clinical_alert_change_alert" FOREIGN KEY ("alert_id") REFERENCES "clinical_alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written parts (spec F07 section 6, ADR-032).

-- PRD F07: one clinical note per appointment, even when two tabs save at the same time.
CREATE UNIQUE INDEX "uq_clinical_note_appointment" ON "clinical_note" ("appointment_id")
    WHERE "appointment_id" IS NOT NULL;
-- Auto-finalization job: drafts and pending edits that reach their lock time.
CREATE INDEX "ix_clinical_note_drafts_lock" ON "clinical_note" ("locks_at")
    WHERE "status" = 'DRAFT' OR "edit_draft_html" IS NOT NULL;
-- Daily cleanup of upload intents that were never confirmed.
CREATE INDEX "ix_clinical_upload_cleanup" ON "clinical_attachment_upload" ("expires_at")
    WHERE "consumed_at" IS NULL;

ALTER TABLE "clinical_note"
    ADD CONSTRAINT "ck_clinical_note_kind" CHECK (("kind" = 'ENCOUNTER') = ("appointment_id" IS NOT NULL)),
    ADD CONSTRAINT "ck_clinical_note_kind_value" CHECK ("kind" IN ('ENCOUNTER', 'STANDALONE')),
    ADD CONSTRAINT "ck_clinical_note_status" CHECK ("status" IN ('DRAFT', 'FINALIZED')),
    -- PRD F07: locked 24 hours after creation.
    ADD CONSTRAINT "ck_clinical_note_lock" CHECK ("locks_at" = "created_at" + interval '24 hours'),
    -- PRD F07: at most 50,000 characters.
    ADD CONSTRAINT "ck_clinical_note_length" CHECK (
        "characters" BETWEEN 0 AND 50000
        AND ("edit_draft_characters" IS NULL OR "edit_draft_characters" BETWEEN 0 AND 50000)),
    ADD CONSTRAINT "ck_clinical_note_finalized" CHECK (("status" = 'FINALIZED') = ("finalized_at" IS NOT NULL)),
    ADD CONSTRAINT "ck_clinical_note_edit_draft" CHECK (
        ("edit_draft_html" IS NULL OR "status" = 'FINALIZED')
        AND (("edit_draft_html" IS NULL) = ("edit_draft_text" IS NULL))
        AND (("edit_draft_html" IS NULL) = ("edit_draft_characters" IS NULL)));

-- PRD F07: addenda have at most 10,000 characters.
ALTER TABLE "clinical_note_addendum"
    ADD CONSTRAINT "ck_clinical_addendum_length" CHECK ("characters" BETWEEN 1 AND 10000);

ALTER TABLE "clinical_attachment"
    -- PRD F07: at most 20 MB per file.
    ADD CONSTRAINT "ck_clinical_attachment_size" CHECK ("size_bytes" BETWEEN 1 AND 20971520),
    ADD CONSTRAINT "ck_clinical_attachment_status" CHECK ("status" IN ('PROCESSING', 'READY', 'FAILED')),
    ADD CONSTRAINT "ck_clinical_attachment_in_error" CHECK (
        ("marked_in_error_at" IS NULL) = ("marked_in_error_by_id" IS NULL));

-- PRD F07: after 24 hours the note is locked permanently. Status columns may still change
-- (auto-finalization, discarding a pending edit); the content may not.
CREATE FUNCTION clinical_note_enforce_lock() RETURNS trigger AS $$
BEGIN
  IF NEW.locks_at IS DISTINCT FROM OLD.locks_at OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'CLINICAL_NOTE_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  IF now() >= OLD.locks_at AND (
       NEW.content_html IS DISTINCT FROM OLD.content_html
    OR NEW.content_text IS DISTINCT FROM OLD.content_text
    OR (NEW.edit_draft_html IS NOT NULL AND NEW.edit_draft_html IS DISTINCT FROM OLD.edit_draft_html)
  ) THEN
    RAISE EXCEPTION 'CLINICAL_NOTE_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'FINALIZED' AND NEW.status <> 'FINALIZED' THEN
    RAISE EXCEPTION 'CLINICAL_NOTE_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_clinical_note_lock" BEFORE UPDATE ON "clinical_note"
    FOR EACH ROW EXECUTE FUNCTION clinical_note_enforce_lock();

-- Clinical records are kept for 20 years (Law 13.787/2018): the application never deletes them.
-- Versions, addenda and alert history are evidence: append and read only.
REVOKE DELETE ON "clinical_note", "clinical_attachment", "clinical_alert" FROM gcli_app;
REVOKE ALL ON "clinical_note_version", "clinical_note_addendum", "clinical_alert_change" FROM gcli_app;
GRANT SELECT, INSERT ON "clinical_note_version", "clinical_note_addendum", "clinical_alert_change" TO gcli_app;
