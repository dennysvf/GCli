-- F16: internationalization and country profiles (ADR-028, ADR-029, ADR-030).
-- Every existing record was created under the Brazilian rules, so data migrates as Brazil, BRL and pt-BR.
-- Data is copied to the new columns before the old ones are dropped; the whole file runs in one transaction.

-- ---------------------------------------------------------------------------------------------
-- Languages and headquarters country
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "organization"
    ADD COLUMN "country" CHAR(2) NOT NULL DEFAULT 'BR',
    ADD COLUMN "default_locale" VARCHAR(5) NOT NULL DEFAULT 'pt-BR',
    ADD CONSTRAINT "ck_organization_country" CHECK ("country" IN ('BR','PT','ES','MX','AR','CL','CO','US')),
    ADD CONSTRAINT "ck_organization_locale" CHECK ("default_locale" IN ('pt-BR','en','es'));

-- A null user language means "use the organization default".
ALTER TABLE "app_user"
    ADD COLUMN "locale" VARCHAR(5),
    ADD CONSTRAINT "ck_app_user_locale" CHECK ("locale" IS NULL OR "locale" IN ('pt-BR','en','es'));

ALTER TABLE "invitation"
    ADD COLUMN "locale" VARCHAR(5) NOT NULL DEFAULT 'pt-BR',
    ADD CONSTRAINT "ck_invitation_locale" CHECK ("locale" IN ('pt-BR','en','es'));

-- The CNPJ becomes a tax ID of the headquarters country, stored normalized.
ALTER TABLE "organization" DROP CONSTRAINT "ck_organization_cnpj";
ALTER TABLE "organization" RENAME COLUMN "cnpj" TO "tax_id";
ALTER TABLE "organization" ALTER COLUMN "tax_id" TYPE VARCHAR(20);
ALTER TABLE "organization" ADD CONSTRAINT "ck_organization_tax_id" CHECK ("tax_id" ~ '^[0-9A-ZÑ&]{6,20}$');

-- ---------------------------------------------------------------------------------------------
-- Units: country, currency, tax ID, E.164 phone and generic address
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "unit" DROP CONSTRAINT "ck_unit_cnpj", DROP CONSTRAINT "ck_unit_cep",
    DROP CONSTRAINT "ck_unit_phone", DROP CONSTRAINT "ck_unit_state";

ALTER TABLE "unit"
    ADD COLUMN "country" CHAR(2) NOT NULL DEFAULT 'BR',
    ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'BRL';
-- The defaults only exist to fill the rows that were there before: a unit always chooses its country.
ALTER TABLE "unit" ALTER COLUMN "country" DROP DEFAULT, ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "unit" RENAME COLUMN "cnpj" TO "tax_id";
ALTER TABLE "unit" RENAME COLUMN "cep" TO "postal_code";
ALTER TABLE "unit" RENAME COLUMN "state" TO "region";
ALTER TABLE "unit" ALTER COLUMN "tax_id" TYPE VARCHAR(20);
ALTER TABLE "unit" ALTER COLUMN "postal_code" TYPE VARCHAR(10);
ALTER TABLE "unit" ALTER COLUMN "region" TYPE VARCHAR(64);
ALTER TABLE "unit" ALTER COLUMN "phone" TYPE VARCHAR(16);
UPDATE "unit" SET "phone" = '+55' || "phone" WHERE "phone" IS NOT NULL;

ALTER TABLE "unit"
    ADD CONSTRAINT "ck_unit_country" CHECK ("country" IN ('BR','PT','ES','MX','AR','CL','CO','US')),
    ADD CONSTRAINT "ck_unit_currency" CHECK ("currency" IN ('BRL','EUR','MXN','ARS','CLP','COP','USD')),
    -- The currency always follows the country (ADR-029).
    ADD CONSTRAINT "ck_unit_currency_country" CHECK (
        ("country" = 'BR' AND "currency" = 'BRL') OR ("country" IN ('PT','ES') AND "currency" = 'EUR')
        OR ("country" = 'MX' AND "currency" = 'MXN') OR ("country" = 'AR' AND "currency" = 'ARS')
        OR ("country" = 'CL' AND "currency" = 'CLP') OR ("country" = 'CO' AND "currency" = 'COP')
        OR ("country" = 'US' AND "currency" = 'USD')),
    ADD CONSTRAINT "ck_unit_tax_id" CHECK ("tax_id" ~ '^[0-9A-ZÑ&]{6,20}$'),
    ADD CONSTRAINT "ck_unit_phone" CHECK ("phone" ~ '^\+[1-9][0-9]{6,14}$');

-- ---------------------------------------------------------------------------------------------
-- Services: one price per currency (service_price) and history per currency
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "service_price" (
    "service_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_service_price" PRIMARY KEY ("service_id","currency")
);
CREATE INDEX "ix_service_price_org_currency" ON "service_price"("organization_id", "currency");
ALTER TABLE "service_price" ADD CONSTRAINT "fk_service_price_service"
    FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- PRD F16: up to 9,999,999 in major units, which is 999,999,900 minor units with two decimals.
ALTER TABLE "service_price" ADD CONSTRAINT "ck_service_price_currency"
    CHECK ("currency" IN ('BRL','EUR','MXN','ARS','CLP','COP','USD'));
ALTER TABLE "service_price" ADD CONSTRAINT "ck_service_price_amount"
    CHECK ("amount_minor" BETWEEN 0 AND 999999999);

INSERT INTO "service_price" ("service_id", "organization_id", "currency", "amount_minor", "updated_at")
SELECT "id", "organization_id", 'BRL', "price_cents", "updated_at" FROM "service";
ALTER TABLE "service" DROP COLUMN "price_cents";

ALTER TABLE "service_price_change" DROP CONSTRAINT "ck_price_change_range";
ALTER TABLE "service_price_change" ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'BRL';
ALTER TABLE "service_price_change" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "service_price_change" RENAME COLUMN "previous_price_cents" TO "previous_amount_minor";
ALTER TABLE "service_price_change" RENAME COLUMN "price_cents" TO "amount_minor";
ALTER TABLE "service_price_change" ALTER COLUMN "previous_amount_minor" TYPE BIGINT;
ALTER TABLE "service_price_change" ALTER COLUMN "amount_minor" TYPE BIGINT;
ALTER TABLE "service_price_change" ADD CONSTRAINT "ck_price_change_range" CHECK (
    "amount_minor" BETWEEN 0 AND 999999999
    AND ("previous_amount_minor" IS NULL OR "previous_amount_minor" BETWEEN 0 AND 999999999));
ALTER TABLE "service_price_change" ADD CONSTRAINT "ck_price_change_currency"
    CHECK ("currency" IN ('BRL','EUR','MXN','ARS','CLP','COP','USD'));
DROP INDEX "ix_price_change_service_time";
CREATE INDEX "ix_price_change_service_time" ON "service_price_change"("service_id", "currency", "changed_at" DESC);

-- ---------------------------------------------------------------------------------------------
-- Appointments: the price snapshot carries its currency
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "appointment" RENAME COLUMN "price_cents" TO "price_minor";
ALTER TABLE "appointment" ALTER COLUMN "price_minor" TYPE BIGINT;
ALTER TABLE "appointment" ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'BRL';
ALTER TABLE "appointment" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "appointment" ADD CONSTRAINT "ck_appointment_currency"
    CHECK ("currency" IN ('BRL','EUR','MXN','ARS','CLP','COP','USD'));
-- ck_appointment_price keeps checking the renamed column: price_minor >= 0.

-- ---------------------------------------------------------------------------------------------
-- Professionals: generic document, E.164 phone and one council registration per country
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "professional_registration" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "council_type" VARCHAR(24) NOT NULL,
    "council_other_name" VARCHAR(40),
    "number" VARCHAR(20),
    "region" VARCHAR(8),
    "npi" CHAR(10),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_registration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ix_registration_professional" ON "professional_registration"("organization_id", "professional_id");
ALTER TABLE "professional_registration" ADD CONSTRAINT "fk_registration_professional"
    FOREIGN KEY ("professional_id") REFERENCES "professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- At most one registration per country for each professional.
CREATE UNIQUE INDEX "uq_registration_professional_country"
    ON "professional_registration" ("professional_id", "country");
-- A registration number belongs to one professional (replaces the F04 council index).
CREATE UNIQUE INDEX "uq_registration_org_number" ON "professional_registration"
    ("organization_id", "country", "council_type", coalesce("council_other_name", ''), coalesce("region", ''), "number")
    WHERE "number" IS NOT NULL;
ALTER TABLE "professional_registration"
    ADD CONSTRAINT "ck_registration_country" CHECK ("country" IN ('BR','PT','ES','MX','AR','CL','CO','US')),
    ADD CONSTRAINT "ck_registration_type" CHECK ("council_type" ~ '^[A-Z_]{2,24}$'),
    ADD CONSTRAINT "ck_registration_other" CHECK (("council_type" = 'OTHER') = ("council_other_name" IS NOT NULL)),
    ADD CONSTRAINT "ck_registration_npi" CHECK ("npi" ~ '^[0-9]{10}$'),
    -- A registration identifies the professional by its number or, for the US, by the NPI.
    ADD CONSTRAINT "ck_registration_identity" CHECK ("number" IS NOT NULL OR "npi" IS NOT NULL);

INSERT INTO "professional_registration"
    ("id", "organization_id", "professional_id", "country", "council_type", "council_other_name", "number", "region")
SELECT gen_random_uuid(), "organization_id", "id", 'BR', "council_type", "council_other_name", "council_number", "council_state"
FROM "professional" WHERE "council_type" <> 'NONE';

DROP INDEX "uq_professional_org_cpf";
DROP INDEX "uq_professional_org_council";
ALTER TABLE "professional" DROP CONSTRAINT "ck_professional_council_type", DROP CONSTRAINT "ck_professional_council",
    DROP CONSTRAINT "ck_professional_cpf", DROP CONSTRAINT "ck_professional_phone",
    DROP CONSTRAINT "ck_professional_state";

ALTER TABLE "professional"
    ADD COLUMN "has_no_council" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "document_country" CHAR(2),
    ADD COLUMN "document_type" VARCHAR(16),
    ADD COLUMN "document_number" VARCHAR(32);
UPDATE "professional" SET "has_no_council" = ("council_type" = 'NONE');
UPDATE "professional" SET "document_country" = 'BR', "document_type" = 'CPF', "document_number" = "cpf"
WHERE "cpf" IS NOT NULL;
ALTER TABLE "professional" DROP COLUMN "council_type", DROP COLUMN "council_other_name",
    DROP COLUMN "council_number", DROP COLUMN "council_state", DROP COLUMN "cpf";

ALTER TABLE "professional" ALTER COLUMN "phone" TYPE VARCHAR(16);
UPDATE "professional" SET "phone" = '+55' || "phone" WHERE "phone" IS NOT NULL;

ALTER TABLE "professional"
    ADD CONSTRAINT "ck_professional_document" CHECK (
        ("document_type" IS NULL) = ("document_number" IS NULL) AND ("document_type" IS NULL) = ("document_country" IS NULL)),
    ADD CONSTRAINT "ck_professional_document_type" CHECK ("document_type" IN
        ('CPF','NIF_PT','DNI_ES','NIE_ES','CURP','DNI_AR','CUIT_AR','RUT_CL','CC_CO','CE_CO','US_DL')),
    ADD CONSTRAINT "ck_professional_document_country" CHECK ("document_country" IN
        ('BR','PT','ES','MX','AR','CL','CO','US')),
    ADD CONSTRAINT "ck_professional_phone" CHECK ("phone" ~ '^\+[1-9][0-9]{6,14}$');
CREATE UNIQUE INDEX "uq_professional_org_document" ON "professional" ("organization_id", "document_type", "document_number")
    WHERE "document_number" IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- Patients: generic document, E.164 phones and generic address
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "patient" DROP CONSTRAINT "ck_patient_cpf", DROP CONSTRAINT "ck_patient_guardian_cpf",
    DROP CONSTRAINT "ck_patient_mobile", DROP CONSTRAINT "ck_patient_secondary";
DROP INDEX "uq_patient_org_cpf";

ALTER TABLE "patient"
    ADD COLUMN "document_country" CHAR(2),
    ADD COLUMN "document_type" VARCHAR(16),
    ADD COLUMN "document_number" VARCHAR(32),
    ADD COLUMN "guardian_document_type" VARCHAR(16),
    ADD COLUMN "guardian_document_number" VARCHAR(32),
    ADD COLUMN "address_country" CHAR(2);
UPDATE "patient" SET "document_country" = 'BR', "document_type" = 'CPF', "document_number" = "cpf"
WHERE "cpf" IS NOT NULL;
UPDATE "patient" SET "guardian_document_type" = 'CPF', "guardian_document_number" = "guardian_cpf"
WHERE "guardian_cpf" IS NOT NULL;
ALTER TABLE "patient" DROP COLUMN "cpf", DROP COLUMN "guardian_cpf";

-- Phones: Brazilian digits become E.164. phone_digits keeps the national numbers, so it stays as it was.
ALTER TABLE "patient" ALTER COLUMN "mobile_phone" TYPE VARCHAR(16), ALTER COLUMN "secondary_phone" TYPE VARCHAR(16),
    ALTER COLUMN "guardian_phone" TYPE VARCHAR(16), ALTER COLUMN "phone_digits" TYPE VARCHAR(34);
UPDATE "patient" SET "mobile_phone" = '+55' || "mobile_phone",
    "secondary_phone" = CASE WHEN "secondary_phone" IS NULL THEN NULL ELSE '+55' || "secondary_phone" END,
    "guardian_phone" = CASE WHEN "guardian_phone" IS NULL THEN NULL ELSE '+55' || "guardian_phone" END;

ALTER TABLE "patient" RENAME COLUMN "cep" TO "postal_code";
ALTER TABLE "patient" RENAME COLUMN "state" TO "region";
ALTER TABLE "patient" ALTER COLUMN "postal_code" TYPE VARCHAR(10), ALTER COLUMN "region" TYPE VARCHAR(64);
UPDATE "patient" SET "address_country" = 'BR'
WHERE "postal_code" IS NOT NULL OR "street" IS NOT NULL OR "number" IS NOT NULL OR "complement" IS NOT NULL
   OR "district" IS NOT NULL OR "city" IS NOT NULL OR "region" IS NOT NULL;

ALTER TABLE "patient"
    ADD CONSTRAINT "ck_patient_document" CHECK (
        ("document_type" IS NULL) = ("document_number" IS NULL) AND ("document_type" IS NULL) = ("document_country" IS NULL)),
    ADD CONSTRAINT "ck_patient_document_type" CHECK ("document_type" IN
        ('CPF','NIF_PT','DNI_ES','NIE_ES','CURP','DNI_AR','CUIT_AR','RUT_CL','CC_CO','CE_CO','US_DL')),
    ADD CONSTRAINT "ck_patient_document_country" CHECK ("document_country" IN
        ('BR','PT','ES','MX','AR','CL','CO','US')),
    ADD CONSTRAINT "ck_patient_guardian_document" CHECK (
        ("guardian_document_type" IS NULL) = ("guardian_document_number" IS NULL)),
    ADD CONSTRAINT "ck_patient_guardian_document_type" CHECK ("guardian_document_type" IN
        ('CPF','NIF_PT','DNI_ES','NIE_ES','CURP','DNI_AR','CUIT_AR','RUT_CL','CC_CO','CE_CO','US_DL')),
    ADD CONSTRAINT "ck_patient_address_country" CHECK ("address_country" IN
        ('BR','PT','ES','MX','AR','CL','CO','US')),
    ADD CONSTRAINT "ck_patient_mobile" CHECK ("mobile_phone" ~ '^\+[1-9][0-9]{6,14}$'),
    ADD CONSTRAINT "ck_patient_secondary" CHECK ("secondary_phone" ~ '^\+[1-9][0-9]{6,14}$'),
    ADD CONSTRAINT "ck_patient_guardian_phone" CHECK ("guardian_phone" ~ '^\+[1-9][0-9]{6,14}$');

-- A document is unique per type inside the organization; the same number under another type is allowed.
CREATE UNIQUE INDEX "uq_patient_org_document" ON "patient" ("organization_id", "document_type", "document_number")
    WHERE "document_number" IS NOT NULL;
CREATE INDEX "ix_patient_document_number" ON "patient"("organization_id", "document_number");
