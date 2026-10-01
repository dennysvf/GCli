-- CreateTable
CREATE TABLE "service_category" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "duration_minutes" SMALLINT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "color" VARCHAR(16) NOT NULL,
    "requires_room" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_allowed_room" (
    "service_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    CONSTRAINT "pk_service_allowed_room" PRIMARY KEY ("service_id","room_id")
);

-- CreateTable
CREATE TABLE "service_price_change" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "previous_price_cents" INTEGER,
    "price_cents" INTEGER NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_price_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_service_category_org_order" ON "service_category"("organization_id", "sort_order");

-- CreateIndex
CREATE INDEX "ix_service_org_active" ON "service"("organization_id", "active");

-- CreateIndex
CREATE INDEX "ix_service_category" ON "service"("category_id");

-- CreateIndex
CREATE INDEX "ix_service_allowed_room_room" ON "service_allowed_room"("room_id");

-- CreateIndex
CREATE INDEX "ix_price_change_service_time" ON "service_price_change"("service_id", "changed_at" DESC);

-- AddForeignKey
ALTER TABLE "service_category" ADD CONSTRAINT "fk_service_category_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "fk_service_org" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "fk_service_category" FOREIGN KEY ("category_id") REFERENCES "service_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_allowed_room" ADD CONSTRAINT "fk_service_allowed_room_service" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_allowed_room" ADD CONSTRAINT "fk_service_allowed_room_room" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_price_change" ADD CONSTRAINT "fk_price_change_service" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- hand-written: case-insensitive unique names (spec F03 section 6)
CREATE UNIQUE INDEX "uq_service_category_org_name" ON "service_category" ("organization_id", lower("name"));
CREATE UNIQUE INDEX "uq_service_org_name" ON "service" ("organization_id", lower("name"));

-- hand-written: value constraints (PRD F03 capabilities)
ALTER TABLE "service" ADD CONSTRAINT "ck_service_duration"
  CHECK ("duration_minutes" BETWEEN 5 AND 480 AND "duration_minutes" % 5 = 0);
ALTER TABLE "service" ADD CONSTRAINT "ck_service_price" CHECK ("price_cents" BETWEEN 0 AND 9999999);
ALTER TABLE "service" ADD CONSTRAINT "ck_service_color" CHECK ("color" IN (
  'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink'));
ALTER TABLE "service_price_change" ADD CONSTRAINT "ck_price_change_range" CHECK (
  "price_cents" BETWEEN 0 AND 9999999
  AND ("previous_price_cents" IS NULL OR "previous_price_cents" BETWEEN 0 AND 9999999));

-- hand-written: the price history is a financial record; the runtime role may only append to it.
REVOKE ALL ON "service_price_change" FROM gcli_app;
GRANT SELECT, INSERT ON "service_price_change" TO gcli_app;

-- hand-written: default categories for organizations created before F03 (new organizations get
-- them from the OrganizationCreated subscriber).
INSERT INTO "service_category" ("id", "organization_id", "name", "sort_order", "version", "created_at", "updated_at")
SELECT uuidv7(), o."id", d."name", d."sort_order", 1, now(), now()
FROM "organization" o
CROSS JOIN (VALUES ('Consultas', 1), ('Procedimentos', 2), ('Terapias', 3)) AS d("name", "sort_order");
